//! Ported from dsh0416/desk-fleet, commit e4b963274b4afae8a7b8065d9efe5c6770bf9339.
//!
//! Low-level FFI bindings to NVIDIA NVENC.
//!
//! Type definitions are auto-generated from `nvEncodeAPI.h` by `bindgen`.
//! The NVENC shared library is loaded at runtime via `libloading` — no
//! SDK binaries need to be redistributed.
//!
//! # Library loading
//!
//! NVENC ships as part of the NVIDIA display driver:
//! - **Windows**: `nvEncodeAPI64.dll`
//! - **Linux**: `libnvidia-encode.so.1`
//!
//! Call [`NvEncApi::load()`] to obtain the entry-point function pointers.

#![cfg(target_os = "windows")]
#![allow(
    // Bindgen output is large and noisy; suppress clippy within this low-level
    // FFI crate so workspace clippy focuses on handwritten logic.
    clippy::all,
    non_camel_case_types,
    non_snake_case,
    non_upper_case_globals,
    // Suppress warnings from bindgen-generated code.
    clippy::upper_case_acronyms,
    clippy::unreadable_literal,
    clippy::missing_safety_doc,
    clippy::too_many_arguments,
    clippy::unnecessary_cast,
    clippy::useless_transmute,
    clippy::default_trait_access,
    clippy::used_underscore_binding,
    clippy::must_use_candidate,
    clippy::ptr_as_ptr,
    unsafe_code,
    dead_code,
    unused_qualifications,
    unnecessary_transmutes,
)]

// ── Auto-generated bindings from nvEncodeAPI.h ────────────────────────

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

// ── GUID constants ────────────────────────────────────────────────────
//
// `static const GUID` in C has internal linkage, so bindgen cannot reference
// them from the shared library.  We define them here as Rust constants.

mod guid;
pub use guid::*;

// ── Version constants ─────────────────────────────────────────────────
//
// C `#define` macros involving expressions are not translated by bindgen,
// so we replicate the version computation here.

pub const NVENCAPI_MAJOR_VERSION: u32 = 13;
pub const NVENCAPI_MINOR_VERSION: u32 = 0;

/// Version format returned by NvEncodeAPIGetMaxSupportedVersion.
pub const NVENCAPI_MAX_VERSION: u32 = (NVENCAPI_MAJOR_VERSION << 4) | NVENCAPI_MINOR_VERSION;

pub const NVENCAPI_VERSION: u32 = NVENCAPI_MAJOR_VERSION | (NVENCAPI_MINOR_VERSION << 24);

/// Compute the per-struct version tag used in the `version` field of every
/// NVENC structure.
#[inline]
#[must_use]
pub const fn nvencapi_struct_version(ver: u32) -> u32 {
    NVENCAPI_VERSION | (ver << 16) | (0x7 << 28)
}

pub const NV_ENCODE_API_FUNCTION_LIST_VER: u32 = nvencapi_struct_version(2);
pub const NV_ENC_OPEN_ENCODE_SESSION_EX_PARAMS_VER: u32 = nvencapi_struct_version(1);
pub const NV_ENC_INITIALIZE_PARAMS_VER: u32 = nvencapi_struct_version(7) | (1 << 31);
pub const NV_ENC_CONFIG_VER: u32 = nvencapi_struct_version(9) | (1 << 31);
pub const NV_ENC_PRESET_CONFIG_VER: u32 = nvencapi_struct_version(5) | (1 << 31);
pub const NV_ENC_CREATE_INPUT_BUFFER_VER: u32 = nvencapi_struct_version(2);
pub const NV_ENC_CREATE_BITSTREAM_BUFFER_VER: u32 = nvencapi_struct_version(1);
pub const NV_ENC_PIC_PARAMS_VER: u32 = nvencapi_struct_version(7) | (1 << 31);
pub const NV_ENC_LOCK_BITSTREAM_VER: u32 = nvencapi_struct_version(2) | (1 << 31);
pub const NV_ENC_LOCK_INPUT_BUFFER_VER: u32 = nvencapi_struct_version(1);
pub const NV_ENC_MAP_INPUT_RESOURCE_VER: u32 = nvencapi_struct_version(4);
pub const NV_ENC_REGISTER_RESOURCE_VER: u32 = nvencapi_struct_version(5);
pub const NV_ENC_CAPS_PARAM_VER: u32 = nvencapi_struct_version(1);
pub const NV_ENC_RC_PARAMS_VER: u32 = nvencapi_struct_version(1);
pub const NV_ENC_RECONFIGURE_PARAMS_VER: u32 = nvencapi_struct_version(1) | (1 << 31);
pub const NV_ENC_SEQUENCE_PARAM_PAYLOAD_VER: u32 = nvencapi_struct_version(1);
pub const NV_ENC_STAT_VER: u32 = nvencapi_struct_version(2);
pub const NV_ENC_EVENT_PARAMS_VER: u32 = nvencapi_struct_version(2);
pub const NV_ENC_CREATE_MV_BUFFER_VER: u32 = nvencapi_struct_version(2);
pub const NV_ENC_MEONLY_PARAMS_VER: u32 = nvencapi_struct_version(4);

pub const NVENC_INFINITE_GOPLENGTH: u32 = 0xFFFF_FFFF;
pub const NV_MAX_SEQ_HDR_LEN: usize = 512;

// ── Dynamic library loader ────────────────────────────────────────────

use libloading::Library;

/// Function pointer type for `NvEncodeAPIGetMaxSupportedVersion`.
pub type FnNvEncodeAPIGetMaxSupportedVersion =
    unsafe extern "C" fn(version: *mut u32) -> NVENCSTATUS;

/// Function pointer type for `NvEncodeAPICreateInstance`.
pub type FnNvEncodeAPICreateInstance =
    unsafe extern "C" fn(function_list: *mut NV_ENCODE_API_FUNCTION_LIST) -> NVENCSTATUS;

/// Holds the dynamically-loaded NVENC library and the two entry-point
/// function pointers.
pub struct NvEncApi {
    // Keep the library handle alive so that the function pointers remain valid.
    _library: Library,
    pub get_max_supported_version: FnNvEncodeAPIGetMaxSupportedVersion,
    pub create_instance: FnNvEncodeAPICreateInstance,
}

impl NvEncApi {
    /// Attempt to load the NVENC library from the system.
    ///
    /// Returns `None` if the library is not found (no NVIDIA driver installed).
    pub fn load() -> Option<Self> {
        // Safety: loading a system-provided GPU driver library is standard
        // practice. The library may run initialisation code in its
        // constructor / DllMain.
        let lib = Self::load_library()?;

        // Safety: these symbols are guaranteed to exist in any NVENC-capable
        // driver.  We copy the raw function pointers so the `Symbol` borrows
        // are released before we move `lib` into the struct.
        // SAFETY: these symbol signatures match nvEncodeAPI.h; the library handle outlives the copied function pointers.
        unsafe {
            let get_max: FnNvEncodeAPIGetMaxSupportedVersion = *lib
                .get::<FnNvEncodeAPIGetMaxSupportedVersion>(b"NvEncodeAPIGetMaxSupportedVersion\0")
                .ok()?;
            let create: FnNvEncodeAPICreateInstance = *lib
                .get::<FnNvEncodeAPICreateInstance>(b"NvEncodeAPICreateInstance\0")
                .ok()?;

            Some(Self {
                _library: lib,
                get_max_supported_version: get_max,
                create_instance: create,
            })
        }
    }

    /// Query the maximum API version supported by the installed driver.
    pub fn max_supported_version(&self) -> Result<u32, NVENCSTATUS> {
        let mut version: u32 = 0;
        // SAFETY: the loaded driver function has the declared ABI and receives initialized writable output storage.
        let status = unsafe { (self.get_max_supported_version)(&raw mut version) };
        if status == NVENCSTATUS::NV_ENC_SUCCESS {
            Ok(version)
        } else {
            Err(status)
        }
    }

    /// Populate and return a function list with all NVENC API entry points.
    pub fn create_function_list(&self) -> Result<NV_ENCODE_API_FUNCTION_LIST, NVENCSTATUS> {
        let mut fl = NV_ENCODE_API_FUNCTION_LIST::default();
        fl.version = NV_ENCODE_API_FUNCTION_LIST_VER;
        // SAFETY: the loaded driver function has the declared ABI and receives initialized writable output storage.
        let status = unsafe { (self.create_instance)(&raw mut fl) };
        if status == NVENCSTATUS::NV_ENC_SUCCESS {
            Ok(fl)
        } else {
            Err(status)
        }
    }

    #[cfg(target_os = "windows")]
    fn load_library() -> Option<Library> {
        // SAFETY: this loads the NVIDIA driver library; its native initialization is part of the NVENC API contract.
        unsafe { Library::new("nvEncodeAPI64.dll").ok() }
    }

    #[cfg(target_os = "linux")]
    fn load_library() -> Option<Library> {
        // SAFETY: this loads the NVIDIA driver library; its native initialization is part of the NVENC API contract.
        unsafe {
            Library::new("libnvidia-encode.so.1")
                .or_else(|_| Library::new("libnvidia-encode.so"))
                .ok()
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    fn load_library() -> Option<Library> {
        None
    }
}
