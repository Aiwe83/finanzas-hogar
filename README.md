# Finanzas del Hogar

Dashboard web para llevar el control de ingresos y gastos mensuales del hogar. Todo se guarda en el propio navegador (`localStorage`); no hay backend, ni cuentas, ni cookies, ni rastreo.

**En producción:** <https://gorgeous-cocada-43a7e4.netlify.app>
**Código fuente:** <https://github.com/Aiwe83/projects/tree/main/finanzas-hogar>

---

## Stack

- HTML + CSS + JavaScript **vanilla** (sin frameworks, sin build).
- [Chart.js](https://www.chartjs.org/) 4.4.1 — gráfico doughnut (gastos por categoría) y barras (evolución mensual).
- [SheetJS / xlsx](https://sheetjs.com/) 0.20.3 — import y export de Excel.
- [Netlify](https://www.netlify.com/) — hosting estático con cabeceras de seguridad (CSP, HSTS, Permissions-Policy…).
- Integridad SRI en los CDN (`<script integrity="…">`) para evitar ejecutar JS manipulado.

---

## Características

- **Resumen mensual**: totales de ingresos, gastos y balance del mes visible.
- **Navegación entre meses** con flechas ← →.
- **Alta, edición y borrado** de movimientos.
- **Deshacer** el último borrado (toast con botón "Deshacer" durante 5 s).
- **Filtro** de búsqueda por categoría o descripción dentro del mes.
- **Dos gráficos**:
  - *Doughnut*: distribución de gastos por categoría del mes actual.
  - *Barras*: ingresos vs. gastos de los últimos 6 meses (incluyendo el visible).
- **Import / Export Excel**:
  - **Export**: descarga `.xlsx` con todos los movimientos.
  - **Import**: elige entre *añadir a los existentes* o *reemplazar todo* (con snapshot + deshacer).
- **Categorías predefinidas** para gastos e ingresos; colores deterministas (mismo nombre → mismo color siempre).
- **Tema oscuro** por defecto.
- **Responsive** (móvil).

---

## Estructura de archivos

```
finanzas/
├── index.html                 estructura HTML + carga de CDNs
├── assets/
│   ├── css/styles.css         tema oscuro, layout responsive
│   └── js/app.js              toda la lógica (estado, render, import/export)
├── docs/
│   └── comandos-claude-code.md  chuleta personal de comandos
├── netlify.toml               cabeceras de seguridad y config de build
├── .gitignore
└── README.md                  este archivo
```

---

## Uso local

Basta con abrir `index.html` en un navegador moderno — todo corre en el cliente.

Si usás **XAMPP**, la carpeta ya está dentro de `htdocs/`, así que también se accede desde:

```
http://localhost/finanzas/
```

---

## Despliegue

Ver la chuleta completa en `comandos-claude-code.txt`. Flujo habitual:

```bash
cd finanzas
git add -A
git commit -m "mensaje descriptivo"
git push origin main

netlify deploy --prod --dir=.
```

---

## Almacenamiento

Los datos viven en dos claves de `localStorage`:

| Clave | Contenido |
|-------|-----------|
| `finanzas_tx_v1` | Array de movimientos (fuente de verdad). |
| `finanzas_snapshot_v1` | Copia previa al último "reemplazar" de import. Permite deshacer. |

Cada movimiento tiene la forma:

```js
{
  id: "uuid",
  type: "income" | "expense",
  date: "YYYY-MM-DD",
  amount: 123.45,
  category: "texto",
  description: "texto opcional"
}
```

---

## Formato Excel (import)

Columnas reconocidas (se aceptan variantes en singular/plural, con y sin tilde):

| Columna | Formatos aceptados |
|---------|---------------------|
| **Fecha** (`fecha`, `Date`) | ISO `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YY`, o número serial de Excel. |
| **Tipo** (`tipo`, `Type`) | `Ingreso` / `Gasto` / `income` / `expense`. |
| **Categoría** (`Categoria`, `Category`) | Texto libre (máx. 60 caracteres). |
| **Importe (€)** (`Importe`, `Amount`) | Acepta `"1.234,56"` (formato ES) y `"1,234.56"` (formato EN). |
| **Descripción** (`Descripcion`, `Description`) | Opcional, máx. 80 caracteres. |

Las filas con datos inválidos se descartan y el diálogo de importación muestra cuántas se omitieron.

---

## Seguridad

`netlify.toml` define cabeceras estrictas:

- `Content-Security-Policy` restringe los scripts únicamente a los dos CDNs usados.
- `X-Frame-Options: DENY` + `frame-ancestors 'none'` → no se puede embeder en iframe.
- `X-Content-Type-Options: nosniff` → sin MIME sniffing.
- `Strict-Transport-Security` fuerza HTTPS.
- `Permissions-Policy` desactiva cámara, micrófono, geolocalización, etc.

Además, en el código:

- `isValidTx` valida cada movimiento antes de cargarlo desde `localStorage` (si alguien manipulara el storage, los valores inválidos se descartan).
- `sanitizeTx` aplica límites de longitud para evitar payloads enormes.
- `pickField` ignora claves peligrosas (`__proto__`, `constructor`, `prototype`) al importar Excel.
- `XLSX.read` se llama con `cellFormula: false` y `cellHTML: false`.

---

## Decisiones de diseño

- **Sin frameworks**: la app es pequeña, no se justifica React/Vue. Vanilla JS mantiene el bundle mínimo y la curva de mantenimiento plana.
- **`localStorage` en lugar de backend**: datos personales y sensibles, no tiene sentido subirlos a un servidor. Si algún día hace falta multi-dispositivo se puede añadir sync encriptado.
- **Colores deterministas por categoría**: `hashString(category) % CATEGORY_COLORS.length`. Así, la misma categoría siempre tiene el mismo color entre sesiones.
- **UUID para `id`**: `crypto.randomUUID()` (disponible en todos los navegadores modernos). Evita colisiones sin depender de un contador.
- **Fechas ISO como strings**: se evita trabajar con `Date` para comparaciones o display (timezones son un dolor). Solo se convierte a `Date` cuando hace falta formatear meses.
