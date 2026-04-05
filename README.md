# ERP Constructora WM_M&S

Frontend React/Vite desplegable en GitHub Pages.
Backend en Firebase Authentication + Firestore + Storage (sin Cloud Run).

## Requisitos

- Node.js 20+
- Cuenta de Firebase con proyecto activo
- Firebase CLI (solo para desplegar reglas/indices)

## Ejecucion local

1. Instala dependencias: npm install
2. Crea un archivo .env.local (opcional) con:
   - VITE_GEMINI_API_KEY=tu_clave_gemini
3. Ejecuta en desarrollo: npm run dev

## Despliegue del frontend en GitHub Pages

Ya se incluyo el workflow [deploy-github-pages.yml](.github/workflows/deploy-github-pages.yml).

Pasos:

1. Sube el repositorio a GitHub y usa la rama main.
2. En GitHub, ve a Settings > Pages y selecciona Source: GitHub Actions.
3. En Settings > Secrets and variables > Actions, agrega:
   - VITE_GEMINI_API_KEY (opcional, para funciones IA del frontend)
4. Haz push a main y espera el workflow de Pages.

## Sincronizacion backend desde el repositorio

Ya se incluyo el workflow [firebase-backend-sync.yml](.github/workflows/firebase-backend-sync.yml).

Este workflow mantiene el backend en comunicacion con el repositorio: cuando cambian reglas/indices en main, GitHub Actions despliega automaticamente Firestore y Storage.

Configura estos secrets en GitHub (Settings > Secrets and variables > Actions):

- FIREBASE_PROJECT_ID: corporacion-mys-2026
- FIREBASE_SERVICE_ACCOUNT_CREDENTIALS: JSON completo de la Service Account de Firebase Admin

Permisos recomendados para la Service Account:

- Cloud Datastore Owner (o permisos equivalentes para reglas/indices Firestore)
- Firebase Rules Admin (o permisos equivalentes para reglas)

## Configuracion del backend Firebase/Firestore

Se agrego configuracion CLI:

- [firebase.json](firebase.json)
- [firestore.rules](firestore.rules)
- [firestore.indexes.json](firestore.indexes.json)

Para publicar reglas e indices en tu proyecto Firebase:

1. Inicia sesion: firebase login
2. Selecciona tu proyecto: firebase use corporacion-mys-2026
3. Despliega seguridad de datos: firebase deploy --only firestore,storage

Tambien puedes usar scripts npm:

- npm run deploy:backend
- npm run deploy:firestore
- npm run deploy:storage

## Notas importantes

- La app ya usa HashRouter, por lo que es compatible con GitHub Pages.
- El backend no depende de Cloud Run para funcionar.
- Si cambias de proyecto Firebase, actualiza [firebase-applet-config.json](firebase-applet-config.json).
