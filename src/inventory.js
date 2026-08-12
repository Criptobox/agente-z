// src/inventory.js
// Script standalone del agente inventory.
// Uso:
//   node src/inventory.js --repoA=axontech/axon-store --repoB=tiendamax/tiendamax-web
//
// En GitHub Actions lo invoca el workflow inventory-watch.yml (cron diario).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from './config.js';
import { complete } from './models.js';
import { compare_inventories } from './tools/compare_inventories.js';
import { writeMemory, nextId } from './memory.js';

// Helper: emitir anotación visible en GitHub Actions UI.
// Modo no-Actions: simplemente loguea a consola.
function actionsWarn(msg) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const safe = String(msg).replace(/\r?\n/g, ' %0A ');
    console.log(`::warning::${safe}`);
  } else {
    console.warn(`[warn] ${msg}`);
  }
}
function actionsNotice(msg) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const safe = String(msg).replace(/\r?\n/g, ' %0A ');
    console.log(`::notice::${safe}`);
  } else {
    console.log(`[notice] ${msg}`);
  }
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v ?? true;
    }
  }
  return {
    repoA: args.repoA || args['repo-a'] || process.env.REPO_A,
    repoB: args.repoB || args['repo-b'] || process.env.REPO_B,
    pathA: args.pathA || args['path-a'],
    pathB: args.pathB || args['path-b'],
    issueNumber: args.issue ? parseInt(args.issue, 10) : null,
  };
}

// Lee las variables INVENTORY_REPO_A / INVENTORY_REPO_B si están configuradas
function loadInventoryConfig() {
  const fromVars = {
    repoA: process.env.INVENTORY_REPO_A || config.targetRepos[0] || null,
    repoB: process.env.INVENTORY_REPO_B || config.targetRepos[1] || null,
  };
  // Si solo hay un TARGET_REPOS, asumimos que comparamos contra sí mismo (no tiene sentido)
  // En ese caso, dejamos null y el usuario debe configurar.
  return fromVars;
}

async function postIssueComment(issueNumber, body) {
  if (!issueNumber || !config.token || !config.repo) {
    console.log(`[inventory] comentario simulado:\n${body}`);
    return;
  }
  const res = await fetch(`https://api.github.com/repos/${config.repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    console.error(`[inventory] no se pudo comentar issue #${issueNumber}: ${res.status}`);
  } else {
    console.log(`[inventory] comentado en issue #${issueNumber}`);
  }
}

async function findDailyIssue() {
  if (!config.token || !config.repo) return null;
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch(
    `https://api.github.com/repos/${config.repo}/issues?labels=daily-diary&state=open&per_page=10`,
    { headers: restApiHeaders() }
  );
  if (!res.ok) return null;
  const issues = await res.json();
  return issues.find(i => i.title.includes(today));
}

async function openInventoryIssue(report) {
  if (!config.token || !config.repo) return null;
  const today = new Date().toISOString().slice(0, 10);
  const urgent = report.summary.agotados > 0;
  const title = `${urgent ? '🔴' : '📦'} Reporte inventario ${today} — ${report.summary.agotados} agotados, ${report.summary.nuevos} nuevos`;
  const body = formatReportForIssue(report);
  const res = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({
      title,
      body,
      labels: ['inventory', urgent ? 'urgent' : 'auto-generated'],
    }),
  });
  if (!res.ok) {
    console.error(`[inventory] no se pudo crear issue: ${res.status}`);
    return null;
  }
  const issue = await res.json();
  return issue.number;
}

// Crea un issue de configuración cuando no se encuentran archivos de inventario.
// Esto NO es un error del código, es un problema de configuración que el usuario
// debe resolver señalando pathA/pathB o configurando repos que tengan inventario.
async function openConfigIssue(repoA, repoB, toolResult) {
  if (!config.token || !config.repo) return null;
  const today = new Date().toISOString().slice(0, 10);
  const patterns = (toolResult.searchedPatterns || []).join(', ');
  const which = toolResult.error.includes(repoA) ? 'A' : toolResult.error.includes(repoB) ? 'B' : '?';
  const title = `⚙️ Configuración inventario ${today} — no se encontró archivo en repo ${which}`;
  const body = [
    `### ⚙️ Configuración de inventario pendiente`,
    '',
    `El workflow **inventory-watch** se ejecutó pero no pudo encontrar un archivo de inventario válido en uno de los repos configurados.`,
    '',
    `**Repos configurados:**`,
    `- Repo A (referencia): \`${repoA}\``,
    `- Repo B (a comparar):  \`${repoB}\``,
    '',
    `**Error:** ${toolResult.error}`,
    '',
    `**Patrones buscados automáticamente:**`,
    '```',
    patterns,
    '```',
    '',
    `**Cómo resolverlo (elige una opción):**`,
    '',
    `1. **Si los repos SÍ tienen inventario pero con otra ruta:**`,
    `   - Dispara el workflow manualmente desde Actions → inventory-watch → Run workflow`,
    `   - Rellena los campos \`path_a\` y \`path_b\` con la ruta exacta (ej: \`src/data/products.json\`)`,
    '',
    `2. **Si los repos NO tienen inventario todavía:**`,
    `   - Crea el archivo en alguno de los patrones buscados (ej: \`products.json\` en la raíz)`,
    `   - O sube un archivo con cualquier nombre que contenga "product", "inventory", "catalog", "items" o "stock" en el nombre`,
    '',
    `3. **Si configuraste los repos de ejemplo por error:**`,
    `   - Ve a Settings → Actions → Variables`,
    `   - Actualiza \`INVENTORY_REPO_A\` e \`INVENTORY_REPO_B\` con tus repos reales (formato \`owner/name\`)`,
    `   - O elimina esas variables para desactivar la vigilancia`,
    '',
    `4. **Si ya no necesitas esta vigilancia:**`,
    `   - Desactiva el workflow desde Actions → inventory-watch → ⋮ → Disable workflow`,
    '',
    `Este issue se creó automáticamente. Si la próxima ejecución vuelve a fallar, se añadirá un comentario con los detalles.`,
  ].join('\n');
  const res = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({
      title,
      body,
      labels: ['inventory', 'config-needed'],
    }),
  });
  if (!res.ok) {
    console.error(`[inventory] no se pudo crear issue de config: ${res.status}`);
    return null;
  }
  const issue = await res.json();
  return issue.number;
}

function formatReportForIssue(report) {
  const lines = [];
  lines.push(`### 📦 Reporte de inventario — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`**${report.labelA}** (${report.totalA} productos) vs **${report.labelB}** (${report.totalB} productos)`);
  lines.push('');
  lines.push(`Archivos: \`${report.fileA}\` vs \`${report.fileB}\``);
  lines.push(`Campos detectados: id=\`${report.fields.id}\`, stock=\`${report.fields.stock || '?'}\`, name=\`${report.fields.name}\`, price=\`${report.fields.price || '?'}\``);
  lines.push('');

  if (report.agotados.length) {
    lines.push(`🔴 **${report.agotados.length} productos agotados** (urgente):`);
    for (const p of report.agotados.slice(0, 20)) {
      lines.push(`- \`${p.id}\` — ${p.name} (was: ${p.stockAgo}, now: 0${p.price ? `, $${p.price}` : ''})`);
    }
    if (report.agotados.length > 20) lines.push(`- ... y ${report.agotados.length - 20} más`);
    lines.push('');
  }

  if (report.nuevos.length) {
    lines.push(`✨ **${report.nuevos.length} productos nuevos** en ${report.labelB}:`);
    for (const p of report.nuevos.slice(0, 20)) {
      lines.push(`- \`${p.id}\` — ${p.name} (${p.stock} unidades${p.price ? `, $${p.price}` : ''})`);
    }
    if (report.nuevos.length > 20) lines.push(`- ... y ${report.nuevos.length - 20} más`);
    lines.push('');
  }

  if (report.stockBajo.length) {
    lines.push(`⚠️ **${report.stockBajo.length} productos con stock bajo** (<5 unidades):`);
    for (const p of report.stockBajo.slice(0, 10)) {
      lines.push(`- \`${p.id}\` — ${p.name} (${p.stock} unidades${p.price ? `, $${p.price}` : ''})`);
    }
    if (report.stockBajo.length > 10) lines.push(`- ... y ${report.stockBajo.length - 10} más`);
    lines.push('');
  }

  if (report.desaparecidos.length) {
    lines.push(`❌ **${report.desaparecidos.length} productos desaparecidos** (estaban en ${report.labelA}, no en ${report.labelB}):`);
    for (const p of report.desaparecidos.slice(0, 10)) {
      lines.push(`- \`${p.id}\` — ${p.name}`);
    }
    lines.push('');
  }

  if (!report.agotados.length && !report.nuevos.length && !report.desaparecidos.length && !report.stockBajo.length) {
    lines.push('✅ **Sin cambios detectados.** Todo el inventario está disponible y sin novedades.');
  }

  const agotados = report.summary.agotados;
  if (agotados > 0) {
    lines.push(`---`);
    lines.push(`**🚨 Acción recomendada:** reabastecer los ${agotados} productos agotados hoy.`);
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs();
  const invConfig = loadInventoryConfig();

  const repoA = args.repoA || invConfig.repoA;
  const repoB = args.repoB || invConfig.repoB;

  if (!repoA || !repoB) {
    console.error('Falta configuración: define --repoA y --repoB, o configura INVENTORY_REPO_A e INVENTORY_REPO_B como variables en GitHub.');
    actionsWarn('inventory-watch: faltan INVENTORY_REPO_A / INVENTORY_REPO_B. ' +
      'Configúralas en Settings → Actions → Variables, o elimina el workflow si no lo necesitas.');
    process.exit(0);  // No romper el workflow; el usuario ya fue notificado.
  }

  console.log(`[inventory] comparando ${repoA} vs ${repoB}`);
  if (args.pathA) console.log(`[inventory] pathA específico: ${args.pathA}`);
  if (args.pathB) console.log(`[inventory] pathB específico: ${args.pathB}`);

  // 1. Comparar inventarios con la tool
  const toolResult = await compare_inventories.run({
    repoA,
    repoB,
    pathA: args.pathA,
    pathB: args.pathB,
  });

  if (!toolResult.ok) {
    // No se encontró inventario: NO es un error de código, es un problema
    // de configuración. Lo notificamos vía issue + anotación de Actions y
    // salimos con 0 para no romper el workflow (evita spam de emails de fail).
    console.error(`[inventory] sin datos: ${toolResult.error}`);
    if (toolResult.searchedPatterns) {
      console.error('[inventory] patrones buscados:', toolResult.searchedPatterns.join(', '));
    }
    actionsWarn(`Inventario no encontrado en ${repoA} vs ${repoB}. ` +
      `Especifica pathA/pathB o configura repos con archivo de productos. ` +
      `Se creará un issue con instrucciones.`);

    // Crear issue de config (o comentar en uno existente de hoy)
    let configIssueNum = args.issueNumber;
    if (!configIssueNum) {
      const dailyIssue = await findDailyIssue();
      if (dailyIssue) configIssueNum = dailyIssue.number;
    }
    if (configIssueNum) {
      await postIssueComment(configIssueNum,
        `⚠️ **inventory-watch sin datos** — ${toolResult.error}\n\n` +
        `Revisa la configuración de \`INVENTORY_REPO_A\` / \`INVENTORY_REPO_B\` o especifica \`pathA\` / \`pathB\` al disparar el workflow.`);
    } else {
      const newNum = await openConfigIssue(repoA, repoB, toolResult);
      if (newNum) console.log(`[inventory] issue de config creado: #${newNum}`);
    }
    // Exit 0: la ejecución del workflow fue correcta, solo no había datos.
    // El usuario ya fue notificado vía issue + anotación.
    process.exit(0);
  }

  const report = toolResult.report;
  console.log(`[inventory] comparación completa:`);
  console.log(`  total A: ${report.totalA}`);
  console.log(`  total B: ${report.totalB}`);
  console.log(`  agotados: ${report.summary.agotados}`);
  console.log(`  nuevos: ${report.summary.nuevos}`);
  console.log(`  desaparecidos: ${report.summary.desaparecidos}`);
  console.log(`  stock bajo: ${report.summary.stockBajo}`);
  console.log(`  disponibles: ${report.summary.disponibles}`);
  actionsNotice(`Inventario OK: ${repoA} vs ${repoB} — ` +
    `${report.summary.agotados} agotados, ${report.summary.nuevos} nuevos, ` +
    `${report.summary.desaparecidos} desaparecidos, ${report.summary.stockBajo} stock bajo.`);

  // 2. Guardar memoria del reporte
  const memId = nextId('episode');
  const memData = {
    id: memId,
    type: 'episode',
    project: 'inventory',
    task_id: `INVENTORY-${new Date().toISOString().slice(0, 10)}`,
    attempt: 1,
    agent: 'inventory',
    strategy: `Comparación ${repoA} vs ${repoB}`,
    gates_failed: [],
    gates_passed: [],
    result: 'COMPLETED',
    needs_human: report.summary.agotados > 0,
    created: new Date().toISOString(),
    summary: report.summary,
    repoA,
    repoB,
  };
  writeMemory('episode', memId, memData, JSON.stringify(report, null, 2));
  console.log(`[inventory] memoria escrita: ${memId}`);

  // 3. Comentar en issue existente, o crear uno nuevo
  let issueNumber = args.issueNumber;
  if (!issueNumber) {
    // Buscar issue diario
    const dailyIssue = await findDailyIssue();
    if (dailyIssue) {
      issueNumber = dailyIssue.number;
      console.log(`[inventory] issue diario encontrado: #${issueNumber}`);
    }
  }

  if (issueNumber) {
    await postIssueComment(issueNumber, formatReportForIssue(report));
  } else {
    // Crear issue nuevo
    const newIssue = await openInventoryIssue(report);
    if (newIssue) console.log(`[inventory] issue creado: #${newIssue}`);
  }

  // 4. Notificación push si hay agotados (vía Issue con label urgent)
  // El dashboard detecta issues con label urgent y muestra notificación.
  if (report.summary.agotados > 0) {
    console.log(`[inventory] 🚨 ${report.summary.agotados} productos agotados — notificación urgente creada`);
  }

  console.log('[inventory] fin');
  return report;
}

main().catch(err => {
  console.error('[inventory] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
