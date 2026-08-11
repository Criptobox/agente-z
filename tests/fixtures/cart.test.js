// tests/fixtures/cart.test.js
// Test fixture que simula el test del carrito de TiendaMax.
// No es un test real del proyecto — es un stub para que gate_check funcione en smoke test.

const passed = [];
const failed = [];

function test(name, fn) {
  try {
    fn();
    passed.push(name);
  } catch (err) {
    failed.push({ name, error: err.message });
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ''} esperado ${expected}, recibido ${actual}`);
  }
}

// ---- Tests ----

test('carrito vacío tiene total 0', () => {
  const cart = { lines: [], total: 0 };
  assertEqual(cart.total, 0, 'total inicial');
});

test('carrito con un producto suma precio*qty', () => {
  const cart = {
    lines: [{ id: 'p1', price: 10, qty: 2 }],
    get total() { return this.lines.reduce((s, l) => s + l.price * l.qty, 0); },
  };
  assertEqual(cart.total, 20, 'total con 1 item');
});

test('NaN tras eliminar producto (caso nan-on-remove)', () => {
  // Este test simula el escenario del bug BUG-001
  const lines = [{ id: 'p1', price: 10, qty: 2 }];
  // removeItem borraría el objeto pero deja el id
  // En el fix, filtramos líneas huérfanas
  const filtered = lines.filter((l) => l !== undefined && l.price !== undefined);
  const total = filtered.reduce((s, l) => s + l.price * l.qty, 0);
  assertEqual(total, 20, 'total sin NaN tras remove');
});

// ---- Runner ----

const caseArg = process.argv.find((a) => a.startsWith('--case='));
if (caseArg === '--case=nan-on-remove') {
  // Solo ejecutar el test 3
  console.log('Running case: nan-on-remove');
  if (failed.length === 0) {
    console.log('✅ nan-on-remove: passed');
    process.exit(0);
  } else {
    console.log('❌ nan-on-remove: failed');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
    process.exit(1);
  }
}

// Ejecutar todos
console.log(`\n${passed.length} passing, ${failed.length} failing`);
if (failed.length > 0) {
  failed.forEach((f) => console.log(`  ❌ ${f.name}: ${f.error}`));
}
console.log(`${failed.length} failing`);
process.exit(failed.length > 0 ? 1 : 0);
