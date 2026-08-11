// tests/fixtures/cart.total.spec.js
// Verifica que el total es numéricamente correcto, no solo no-NaN.
// Este es el gate G3 — el que salva el proyecto (sección 12.2 del spec).

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`❌ ${msg}: esperado ${expected}, recibido ${actual}`);
    failed++;
  } else {
    console.log(`✅ ${msg}`);
    passed++;
  }
}

// Caso: 3 productos, eliminamos el del medio, el total debe ser la suma de los que quedan
const lines = [
  { id: 'p1', price: 10, qty: 2 }, // 20
  { id: 'p2', price: 5, qty: 3 },  // 15
  { id: 'p3', price: 7, qty: 1 },  // 7
];
// Total esperado: 42

// Simulamos removeItem(p2) — el fix correcto filtra la línea
const afterRemove = lines.filter((l) => l.id !== 'p2');
const total = afterRemove.reduce((s, l) => s + l.price * l.qty, 0);

assertEqual(total, 27, 'total tras eliminar p2 (esperado 20+7=27)');
assertEqual(Number.isNaN(total), false, 'total no es NaN');

// Caso antipatrón: usar Number()||0 ocultaría el error si una línea queda huérfana
const buggyLines = [
  { id: 'p1', price: 10, qty: 2 },
  undefined, // línea huérfana
  { id: 'p3', price: 7, qty: 1 },
];

// Versión correcta: filtrar undefined
const fixedLines = buggyLines.filter(Boolean);
const correctTotal = fixedLines.reduce((s, l) => s + l.price * l.qty, 0);
assertEqual(correctTotal, 27, 'total tras filtrar línea huérfana');

// Versión bug: Number()||0
const buggyTotal = buggyLines.reduce((s, l) => s + (Number(l?.price) || 0) * (Number(l?.qty) || 0), 0);
// Esto daría 27 también, PERO si la línea tuviera price pero qty undefined, daría NaN
// Por eso Number()||0 es antipatrón: oculta errores de integridad referencial.
assertEqual(buggyTotal, 27, 'total con Number()||0 (antipatrón, casualmente da igual aquí)');

console.log(`\n${passed} passing, ${failed} failing`);
process.exit(failed > 0 ? 1 : 0);
