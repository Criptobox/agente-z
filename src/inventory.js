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
    process.exit(1);
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
    console.error(`[inventory] error: ${toolResult.error}`);
    if (toolResult.searchedPatterns) {
      console.error('[inventory] patrones buscados:', toolResult.searchedPatterns.join(', '));
      console.error('[inventory] tip: especifica --pathA y --pathB con la ruta exacta al archivo de productos.');
    }
    process.exit(1);
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
