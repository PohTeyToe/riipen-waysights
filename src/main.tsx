import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/overpass/wght.css'
import '@fontsource-variable/overpass-mono/wght.css'
import './styles.css'
import { App } from './App'
import { RECORDED_NEAR } from './lib/rule4'
import { StoreProvider } from './lib/store'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider initialNear={RECORDED_NEAR}>
      <App />
    </StoreProvider>
  </StrictMode>,
)
