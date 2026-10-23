import { createPinia } from "pinia"
import { createApp, vaporInteropPlugin } from "vue"
import App from "./App.vue"
import { i18n } from "./i18n"
import { router } from "./router"
import "virtual:uno.css"
import "./styles.css"

document.documentElement.lang = window.deskfleet.locale

const app = createApp(App)

// Vapor components render inside VDOM libraries such as vue-router's RouterView.
app.use(vaporInteropPlugin)
app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount("#root")
