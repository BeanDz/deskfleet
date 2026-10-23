//! Interruptible Unix PTY I/O, including when a descendant retains the slave.

use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, RawFd};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use filedescriptor::{FileDescriptor, POLLIN, POLLOUT, poll, pollfd};
use portable_pty::MasterPty;
use tokio::sync::watch;

use super::{Result, backend};

struct MasterFd<'a> {
    fd: RawFd,
    _master: &'a dyn MasterPty,
}

impl AsRawFd for MasterFd<'_> {
    fn as_raw_fd(&self) -> RawFd {
        self.fd
    }
}

type PtyIo = (Box<dyn Read + Send>, Box<dyn Write + Send>);

pub(super) fn io(
    master: &dyn MasterPty,
    closed: Arc<AtomicBool>,
    cancelled: watch::Receiver<bool>,
) -> Result<PtyIo> {
    let master_fd = MasterFd {
        fd: master
            .as_raw_fd()
            .ok_or_else(|| backend("open I/O", "PTY has no file descriptor"))?,
        _master: master,
    };
    let mut reader =
        FileDescriptor::dup(&master_fd).map_err(|error| backend("open reader", error))?;
    reader
        .set_non_blocking(true)
        .map_err(|error| backend("configure reader", error))?;
    let writer = reader
        .try_clone()
        .map_err(|error| backend("open writer", error))?;
    Ok((
        Box::new(Reader {
            fd: reader,
            closed: Arc::clone(&closed),
            cancelled,
        }),
        Box::new(Writer { fd: writer, closed }),
    ))
}

fn ready(fd: RawFd, events: i16) -> io::Result<()> {
    let mut descriptors = [pollfd {
        fd,
        events,
        revents: 0,
    }];
    // Readiness wakes immediately when bytes arrive. The timeout only bounds
    // cancellation and noticing a shell exit while a background job keeps the
    // slave open. filedescriptor uses select for macOS PTY compatibility.
    match poll(&mut descriptors, Some(Duration::from_millis(25))) {
        Ok(_) => Ok(()),
        Err(filedescriptor::Error::Poll(error) | filedescriptor::Error::Io(error))
            if error.kind() == io::ErrorKind::Interrupted =>
        {
            Ok(())
        }
        Err(error) => Err(io::Error::other(error)),
    }
}

struct Reader {
    fd: FileDescriptor,
    closed: Arc<AtomicBool>,
    cancelled: watch::Receiver<bool>,
}

impl Read for Reader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        loop {
            if *self.cancelled.borrow() {
                return Ok(0);
            }
            match self.fd.read(buffer) {
                // Linux returns EIO when the last slave closes.
                Err(error) if error.raw_os_error() == Some(nix::errno::Errno::EIO as i32) => {
                    return Ok(0);
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    if self.closed.load(Ordering::Acquire) {
                        return Ok(0);
                    }
                    ready(self.fd.as_raw_fd(), POLLIN)?;
                }
                result => return result,
            }
        }
    }
}

struct Writer {
    fd: FileDescriptor,
    closed: Arc<AtomicBool>,
}

impl Write for Writer {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        loop {
            if self.closed.load(Ordering::Acquire) {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "terminal is closed",
                ));
            }
            match self.fd.write(data) {
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    ready(self.fd.as_raw_fd(), POLLOUT)?
                }
                result => return result,
            }
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
