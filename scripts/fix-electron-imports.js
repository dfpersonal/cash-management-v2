#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files to update
const files = [
  'packages/electron-app/src/main/main.ts',
  'packages/electron-app/src/main/menu.ts',
  'packages/electron-app/src/main/preload.ts',
  'packages/electron-app/src/main/ipc-handlers/document-handlers.ts',
  'packages/electron-app/src/main/ipc-handlers/optimization-handlers.ts',
  'packages/electron-app/src/main/ipc-handlers/orchestrator-handlers.ts',
  'packages/electron-app/src/main/ipc-handlers/scraper-config-handlers.ts',
  'packages/electron-app/src/main/ipc-handlers/transaction-handlers.ts',
  'packages/electron-app/src/main/services/BackupService.ts',
  'packages/electron-app/src/main/services/DocumentCleanupService.ts',
  'packages/electron-app/src/main/services/DocumentFileManager.ts',
  'packages/electron-app/src/main/services/FSCSComplianceService.ts',
  'packages/electron-app/src/main/services/RateOptimizerService.ts',
  'packages/electron-app/src/main/services/ScraperProcessManager.ts',
  'packages/electron-app/src/main/services/SubprocessService.ts',
];

// Mapping of imports
const replacements = [
  // Pipeline services
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/OrchestrationService['"]/g, to: "from '@cash-mgmt/pipeline'" },
  { from: /from ['"]\.\.\/shared\/services\/OrchestrationService['"]/g, to: "from '@cash-mgmt/pipeline'" },

  // Shared services
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/DatabaseService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/shared\/services\/DatabaseService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/DocumentService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/TransactionService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/ReconciliationService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/InterestPaymentService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/InterestEventService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/AuditService['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/services\/ConfigurationService['"]/g, to: "from '@cash-mgmt/shared'" },

  // Shared types
  { from: /from ['"]\.\.\/\.\.\/shared\/types\/DocumentTypes['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/types\/TransactionTypes['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/types\/OptimizationTypes['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/types\/ScraperTypes['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/types\/PortfolioTypes['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/types\/ConfigurationTypes['"]/g, to: "from '@cash-mgmt/shared'" },

  // Shared utils
  { from: /from ['"]\.\.\/\.\.\/shared\/utils\/DatabaseValidator['"]/g, to: "from '@cash-mgmt/shared'" },
  { from: /from ['"]\.\.\/\.\.\/shared\/utils\/formatters['"]/g, to: "from '@cash-mgmt/shared'" },
];

let totalChanges = 0;

files.forEach(file => {
  const filePath = path.join(process.cwd(), file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  let fileChanges = 0;

  replacements.forEach(({ from, to }) => {
    const matches = content.match(from);
    if (matches) {
      content = content.replace(from, to);
      changed = true;
      fileChanges += matches.length;
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated ${file} (${fileChanges} imports)`);
    totalChanges += fileChanges;
  }
});

console.log(`\n✅ Migration complete! Updated ${totalChanges} imports in ${files.length} files.`);
