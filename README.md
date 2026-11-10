# Registro diario

App web instalable (PWA) para el registro diario de ejercicios. Funciona sin conexión y
guarda los datos **solo en el dispositivo** (IndexedDB). No hay servidor ni cuenta.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `exercises.js` | Los ejercicios: títulos, guías «Cómo hacerlo», ejemplos y campos |
| `app.js` | Pantallas (Hoy, Historial, Ajustes), guardado automático, copia de seguridad, PIN |
| `pdf.js` | PDF diario y semanal (jsPDF, generado en el propio móvil) |
| `sw.js` | Funcionamiento sin conexión |
| `vendor/jspdf.umd.min.js` | Librería jsPDF 2.5.1 |

## Cambiar o añadir ejercicios

1. En `exercises.js`, copia `TEMPLATES[1]` como `TEMPLATES[2]` y haz los cambios ahí.
2. Sube `CURRENT_VERSION` a 2.
   Los días antiguos se siguen viendo y exportando con su plantilla original.
3. Sube `VERSION` en `sw.js` y el `?v=` de los enlaces en `index.html`.

Para cambios solo de texto (una guía, un ejemplo) basta con editar la versión actual.

## Probar en local

```bash
python -m http.server 8765 --directory "C:/Users/Luis Almenar/Documents/registro-diario"
```

Y abrir http://localhost:8765
