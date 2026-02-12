# Camouf Roadmap — Plugin & MCP Evolution

**Versione target**: 0.8.0  
**Data**: Febbraio 2026  
**Obiettivo**: Trasformare plugin ecosystem e MCP integration da proof-of-concept a prodotto

---

## Panoramica

Sei step chirurgici, in ordine di dipendenza. Ogni step è auto-contenuto e rilasciabile.

| Step | Cosa | Effort | Impatto | Stato |
|------|------|--------|---------|-------|
| 1 | `exports` field in package.json | 10 min | Sblocca plugin ecosystem | ✅ DONE |
| 2 | Integrare `camouf_analyze` con core | 2-3 ore | MCP da demo a prodotto | ✅ DONE |
| 3 | Regole MCP dinamiche da RuleEngine | 1-2 ore | Plugin rules visibili all'AI | ✅ DONE |
| 4 | MCP Prompts | 1-2 ore | Insegna all'AI come usare Camouf | ✅ DONE |
| 5 | `npx camouf init --plugin` | 2 ore | Onboarding autori plugin | ✅ DONE |
| 6 | `createRuleTestContext` helper | 3 ore | Produttività plugin authors 10x | ✅ DONE |

---

## Step 1 — Package Exports ✅

**File**: `package.json`  
**Problema**: Chi scrive un plugin non può fare `import { CamoufPlugin } from 'camouf'` — non c'è l'exports map.  
**Soluzione**: Aggiungere `exports` field con entry points per types, rules, plugin API, testing.

```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./types": { "types": "./dist/types/index.d.ts", "import": "./dist/types/index.js" },
  "./rules": { "types": "./dist/core/rules/rule.interface.d.ts", "import": "./dist/core/rules/rule.interface.js" },
  "./plugin": { "types": "./dist/core/plugins/index.d.ts", "import": "./dist/core/plugins/index.js" },
  "./testing": { "types": "./dist/testing/index.d.ts", "import": "./dist/testing/index.js" }
}
```

Creato anche `src/index.ts` come barrel export con tutti i tipi pubblici.

---

## Step 2 — MCP Analyze Integration ✅

**File**: `src/mcp/tools/analyze.ts`  
**Problema**: Le import al core (`ConfigurationManager`, `ProjectScanner`, `DependencyAnalyzer`) sono commentate. Il tool reimplementa tutto con `fs.readdir` ricorsivo — non usa il dependency graph né la project detection.  
**Soluzione**: Scommentare le import, usare `ProjectScanner.scan()` per il graph reale, `DependencyAnalyzer` per l'analisi. Mantenere il fallback fs-based per quando il core non è disponibile.

**Risultato**: `camouf_analyze` restituisce:
- Dependency graph reale (non lista file)
- Layer detection
- Circular dependency warnings
- Type/interface inventory dal parser
- Convention analysis basata sui dati reali

---

## Step 3 — Dynamic MCP Rules ✅

**File**: `src/mcp/resources/rules.ts`  
**Problema**: `getAllRuleDocs()` è un array hardcoded di 18 regole. Non riflette config attiva, non include plugin rules, va aggiornato a mano.  
**Soluzione**: Generare la documentazione a runtime da `RuleEngine.getEnabledRules()` + `PluginRegistry.getAllRules()`. Ogni `IRule` ha già `id`, `name`, `description`, `severity`, `tags`.

**Cambiamenti**:
1. `rules.ts`: leggere regole dal RuleEngine invece che da array statico
2. Aggiungere resource `camouf://config` — configurazione attiva

---

## Step 4 — MCP Prompts ✅

**File**: nuovo `src/mcp/prompts/` directory  
**Problema**: Nessun MCP Prompt. L'AI ha i tool ma non sa COME usarli in sequenza.  
**Soluzione**: 4 prompts predefiniti che guidano il workflow dell'AI.

**Prompts**:
1. `before-writing-code` — "Analizza il progetto prima di generare codice"
2. `after-generating-code` — "Valida e fixa il codice generato"
3. `understanding-violations` — "Come interpretare i risultati di Camouf"
4. `project-conventions` — "Quali regole sono attive e perché"

**Registrazione in** `src/mcp/index.ts`: aggiungere `prompts` capability e handlers.

---

## Step 5 — Plugin Scaffolding ✅

**File**: `src/cli/commands/init.ts`  
**Problema**: Nessuno scaffolding per plugin. Chi vuole creare un plugin deve copiare `camouf-plugin-react` a mano.  
**Soluzione**: Aggiungere `--plugin` flag al comando `init` che genera la struttura base di un plugin.

**Struttura generata**:
```
camouf-plugin-{name}/
├── package.json          # Con peerDependency su camouf
├── tsconfig.json
├── src/
│   ├── index.ts          # Plugin entry con metadata
│   └── rules/
│       └── example.rule.ts  # Regola di esempio
└── README.md
```

---

## Step 6 — Rule Test Context ✅

**File**: nuovo `src/testing/` directory, esportato via `camouf/testing`  
**Problema**: Chi scrive un plugin non ha modo di testare le regole senza creare un intero progetto finto.  
**Soluzione**: Esportare un `createRuleTestContext()` helper.

```typescript
import { createRuleTestContext } from 'camouf/testing';

const context = createRuleTestContext({
  files: {
    'shared/types.ts': 'export interface User { id: string; name: string; }',
    'client/api.ts': 'import { User } from "../shared/types"; function getUsers(): Usr[] {}',
  },
  config: { rules: { builtin: { 'function-signature-matching': 'error' } } },
});

const result = await myRule.check(context);
expect(result.violations).toHaveLength(1);
```

---

## Note Implementative

- Ogni step viene fatto su branch `feat/roadmap-step-N`
- Ogni step ha un test manuale documentato
- Non introduciamo nuove dipendenze npm (eccetto eventuali @types)
- Manteniamo backward compatibility su CLI e config
