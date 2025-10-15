# Documentation Maintenance Guide

**Purpose:** Manual workflows for maintaining documentation
**Audience:** Daily reference during development
**Prerequisite:** Complete [SETUP-GUIDE.md](./SETUP-GUIDE.md) first

This guide covers **manual** documentation maintenance. All workflows here work without automation.

For automated maintenance, see [AUTOMATION-PLAN.md](./AUTOMATION-PLAN.md) (optional).

---

## Quick Command Reference

| Task                  | Command                    |
| --------------------- | -------------------------- |
| Regenerate API docs   | `npm run docs:generate`    |
| Start docs dev server | `npm run docs:dev`         |
| Build production docs | `npm run docs:build`       |
| Deploy to Netlify     | `netlify deploy --prod`    |
| Lint markdown         | `npm run lint:md`          |
| Fix markdown issues   | `npm run lint:md:fix`      |
| Format all files      | `npm run format`           |
| Validate diagrams     | `npm run diagram:validate` |

---

## Table of Contents

1. [Daily Development Workflows](#daily-development-workflows)
2. [Weekly Maintenance](#weekly-maintenance)
3. [When Adding New Code](#when-adding-new-code)
4. [Database Schema Changes](#database-schema-changes)
5. [Working with Claude Code](#working-with-claude-code)
6. [Versioning Documentation](#versioning-documentation)
7. [Troubleshooting](#troubleshooting)
8. [Key Commands Summary](#key-commands-summary)

---

## Daily Development Workflows

### When You Code

1. **Write code** in TypeScript/JavaScript
2. **Ask Claude Code** to add TSDoc comments:
   ```
   Please add comprehensive TSDoc comments to this function/class
   ```
3. **Commit changes** - Git hooks automatically format and lint

### When You Make Architectural Decisions

1. **Document immediately** in CLAUDE.md or create ADR
2. **Ask Claude Code** to help explain the decision:
   ```
   Please document this architectural decision in CLAUDE.md, explaining:
   - Context (why this decision was needed)
   - Decision (what we decided)
   - Consequences (trade-offs and implications)
   ```

---

## Weekly Maintenance

Run these commands weekly to keep documentation current:

```bash
# Regenerate API docs
npm run docs:generate

# Lint and fix markdown
npm run lint:md:fix

# Format all files
npm run format

# Validate diagrams
npm run diagram:validate

# Rebuild documentation site
npm run docs:build

# Deploy updates
netlify deploy --prod
```

**Estimated time:** 15-30 minutes per week

---

## When Adding New Code

### New Public API (function, class, interface)

1. Write the code
2. Ask Claude Code to add TSDoc comments
3. Regenerate API docs: `npm run docs:generate`
4. Verify in Docusaurus: `npm run docs:dev`
5. Commit

**Example workflow:**

```bash
# After writing new function in packages/shared/src/services/NewService.ts
# Ask Claude Code: "Add TSDoc comments to NewService"

# Regenerate API docs
npm run docs:generate

# Verify
npm run docs:dev
# Open http://localhost:3000/docs/api/shared

# Commit
git add packages/shared/src/services/NewService.ts
git add docs/api/
git commit -m "feat(shared): Add NewService with documentation"
```

### New Package

1. Create package structure
2. Create `packages/{new-package}/CLAUDE.md`
3. Update root `CLAUDE.md` with package info
4. Update `typedoc.json` to include new package
5. Create `packages/docs/docs/packages/{new-package}.md`
6. Update monorepo-structure diagram
7. Regenerate docs and commit

**Detailed steps:**

```bash
# 1. Create package structure
mkdir -p packages/new-package/src

# 2. Ask Claude Code to create CLAUDE.md
# "Create packages/new-package/CLAUDE.md documenting this new package"

# 3. Update root CLAUDE.md
# Add new package to Repository Structure section

# 4. Update typedoc.json
# Add "packages/new-package" to entryPoints array

# 5. Create Docusaurus page
# Ask Claude Code: "Create packages/docs/docs/packages/new-package.md"

# 6. Update diagram
# Edit docs/architecture/monorepo-structure.md to include new package

# 7. Regenerate and commit
npm run docs:generate
npm run docs:build
git add .
git commit -m "feat: Add new-package with documentation"
```

### New Pattern or Convention

1. Create example file in `examples/`
2. Document pattern in relevant CLAUDE.md
3. Update Docusaurus guides if needed
4. Commit

**Example:**

```bash
# 1. Ask Claude Code to create example
# "Create examples/new-pattern.ts showing [pattern description]"

# 2. Test example compiles
npx tsc --noEmit examples/new-pattern.ts

# 3. Update relevant CLAUDE.md
# Add pattern to "Common Patterns" section

# 4. Format and commit
npm run format
git add examples/new-pattern.ts packages/*/CLAUDE.md
git commit -m "docs: Add new-pattern example and documentation"
```

### Breaking Changes

1. Update CHANGELOG.md (use Changesets if configured)
2. Update migration guide in Docusaurus
3. Update API documentation
4. Ask Claude Code to help write release notes

**Example workflow:**

```bash
# 1. Document breaking change
echo "## [2.0.0] - $(date +%Y-%m-%d)

### Breaking Changes
- Changed function signature of foo() to bar()

### Migration Guide
\`\`\`typescript
// Before
foo(param1, param2);

// After
bar({ param1, param2 });
\`\`\`
" >> CHANGELOG.md

# 2. Update migration guide in Docusaurus
# Edit packages/docs/docs/migration-guide.md

# 3. Regenerate API docs
npm run docs:generate

# 4. Ask Claude Code to write release notes
# "Write release notes for v2.0.0 with breaking changes to foo()"

# 5. Commit and tag
git add CHANGELOG.md packages/docs/docs/migration-guide.md
git commit -m "docs: Document v2.0.0 breaking changes"
git tag v2.0.0
```

---

## Database Schema Changes

When you modify the database schema, follow these steps to update documentation:

### Step 1: Apply Schema Changes

```bash
# Apply your schema changes (migrations, DDL changes, etc.)
# This depends on your migration strategy
```

### Step 2: Export Schema from DbSchema

1. Open database in [DbSchema](https://dbschema.com)
2. File → Export → Documentation
3. Select format: **Markdown**
4. Export location: Choose a temporary directory
5. Files generated:
   - `Schema-doc.md` - Complete schema documentation
   - `MainDiagram.svg` - ER diagram

### Step 3: Copy Documentation Files

```bash
# Copy exported files to docs/database/
cp /path/to/exports/Schema-doc.md /Users/david/Websites/cash-management-v2/docs/database/Schema-doc.md
cp /path/to/exports/MainDiagram.svg /Users/david/Websites/cash-management-v2/docs/database/MainDiagram.svg
```

### Step 4: Update Docusaurus

```bash
# Navigate to Docusaurus directory
cd packages/docs

# Copy to Docusaurus
cp ../../docs/database/Schema-doc.md docs/database/schema.md
cp ../../docs/database/MainDiagram.svg static/database/

# Return to root
cd ../..
```

### Step 5: Rebuild and Deploy

```bash
# Rebuild documentation site
npm run docs:build

# Deploy to Netlify
netlify deploy --prod
```

### Step 6: Commit Changes

```bash
# Stage schema documentation
git add docs/database/Schema-doc.md
git add docs/database/MainDiagram.svg
git add packages/docs/docs/database/schema.md
git add packages/docs/static/database/MainDiagram.svg

# Commit
git commit -m "docs(database): Update schema documentation"

# Push (triggers automatic deployment if configured)
git push
```

**Estimated time:** 15-30 minutes

---

## Working with Claude Code

### Common Documentation Tasks

**Ask Claude Code to:**

- **Add TSDoc comments:** "Please add TSDoc to all public methods in this file"
- **Update CLAUDE.md:** "Update packages/pipeline/CLAUDE.md to reflect the new validation service"
- **Create diagrams:** "Create a Mermaid sequence diagram showing the scraper execution flow"
- **Write examples:** "Create an example showing how to use the new FRN cache service"
- **Explain code:** "Explain this financial calculation logic for documentation"
- **Review documentation:** "Review the CLAUDE.md files for accuracy and completeness"

### Best Practices

- **Be specific** about what you want documented
- **Provide context** (why this code exists, what problem it solves)
- **Ask Claude Code to verify** against actual code
- **Review AI-generated content**, especially for financial logic
- **Commit documentation changes** alongside code changes

### Example Prompts

#### Adding TSDoc Comments

```
Please add comprehensive TSDoc comments to the calculateFSCSCompliance() function in packages/optimization/src/services/FSCSComplianceService.ts.

Include:
- Function purpose and when to use it
- @param descriptions for each parameter
- @returns description with expected format
- @throws for any errors that might be thrown
- @example showing typical usage
```

#### Updating CLAUDE.md

```
I just added a new service called CacheManagementService to packages/shared/src/services/.
Please update packages/shared/CLAUDE.md to:
1. Add CacheManagementService to the "Core Services" section
2. Explain what it does and when to use it
3. Add a common pattern example showing initialization and usage
```

#### Creating Architecture Diagrams

```
Create a Mermaid sequence diagram showing the complete FRN matching process:
1. JSONIngestionService receives scraped data
2. FRNMatchingService looks up FRN in cache
3. If not found, queries BoE institution database
4. Updates cache with result
5. Returns matched product

Save to docs/architecture/frn-matching-sequence.md
```

#### Writing Code Examples

```
Create a working TypeScript example showing how to use the OptimizationService to:
1. Load portfolio from database
2. Load available products
3. Run optimization with FSCS compliance
4. Save recommended allocations

Include error handling and comments explaining each step.
Save to examples/optimization-workflow.ts
```

---

## Versioning Documentation

### When Releasing a New Version

Use Docusaurus versioning to maintain documentation for multiple versions:

```bash
# Create a new version snapshot
cd packages/docs
npm run docusaurus docs:version 1.0.0
cd ../..
```

**What this does:**

- Creates `packages/docs/versioned_docs/version-1.0.0/`
- Copies current docs to versioned directory
- Future edits to `packages/docs/docs/` become "Next" version
- Users can switch between versions in the UI

### Update Version Numbers

```bash
# Update package.json files
npm version minor  # or major, patch

# Update version in Docusaurus config
# Edit packages/docs/docusaurus.config.ts

# Update CHANGELOG.md
# Add release notes

# Commit and tag
git add package.json package-lock.json CHANGELOG.md packages/docs/
git commit -m "chore: Release v1.1.0"
git tag v1.1.0
git push --tags
```

### Maintaining Multiple Versions

- **Current version** (in `packages/docs/docs/`) - Active development
- **Versioned docs** (in `packages/docs/versioned_docs/`) - Past releases
- **Edit versioned docs** only for critical fixes
- **New features** go in current version only

---

## Troubleshooting

### TypeDoc Issues

#### Problem: TypeDoc fails to generate docs

**Solutions:**

```bash
# Check TypeScript compiles
npx tsc --noEmit

# Check typedoc.json syntax
cat typedoc.json | jq .

# Run with verbose logging
npx typedoc --logLevel Verbose

# Clean and regenerate
rm -rf docs/api
npm run docs:generate
```

#### Problem: Missing packages in generated docs

**Solution:** Check `typedoc.json` includes all packages in `entryPoints`

```json
{
  "entryPoints": [
    "packages/shared",
    "packages/pipeline",
    "packages/optimization",
    "packages/electron-app/src/main",
    "packages/new-package" // Add your new package
  ]
}
```

---

### Docusaurus Issues

#### Problem: Dev server fails to start

**Solutions:**

```bash
# Clear cache
cd packages/docs
rm -rf .docusaurus node_modules
npm install
cd ../..

# Try again
npm run docs:dev
```

#### Problem: Mermaid diagrams don't render

**Solution:** Verify Mermaid plugin installed and configured:

```bash
cd packages/docs
npm list @docusaurus/theme-mermaid

# Check docusaurus.config.ts has:
# markdown: { mermaid: true }
# themes: ['@docusaurus/theme-mermaid']
```

#### Problem: Build fails

**Solutions:**

```bash
# Check for broken links
npm run docs:build -- --no-minify

# Check for syntax errors in markdown
npm run lint:md

# Clear cache and rebuild
cd packages/docs
rm -rf .docusaurus build
npm run docs:build
cd ../..
```

---

### Netlify Issues

#### Problem: Deployment fails

**Solutions:**

```bash
# Check build works locally
npm run docs:build

# Check netlify.toml syntax
cat netlify.toml

# Check Netlify build logs
netlify logs

# Deploy with debug
netlify deploy --debug --prod
```

#### Problem: Site shows 404 errors

**Solution:** Verify `netlify.toml` has redirect rule:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### Problem: Environment variables missing

**Solution:** Set in Netlify dashboard:

1. Go to Netlify dashboard
2. Site settings → Build & deploy → Environment variables
3. Add required variables (e.g., `NODE_VERSION`)

---

### Git Hooks Issues

#### Problem: Pre-commit hook doesn't run

**Solutions:**

```bash
# Reinstall Husky
rm -rf .husky
npx husky init
cat > .husky/pre-commit << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
npx lint-staged
EOF
chmod +x .husky/pre-commit

# Test
echo "# Test" > test.md
git add test.md
git commit -m "test"
git reset HEAD~1
rm test.md
```

#### Problem: Linting fails on commit

**Solutions:**

```bash
# Fix markdown issues
npm run lint:md:fix

# Format files
npm run format

# Try commit again
git commit
```

---

### Markdown Linting Issues

#### Problem: False positive linting errors

**Solution:** Update `.markdownlint.json` to disable specific rules:

```json
{
  "default": true,
  "MD013": false, // Line length
  "MD024": false, // Duplicate headings
  "MD033": {
    "allowed_elements": ["details", "summary", "br", "table"] // Allow specific HTML tags
  }
}
```

---

### Claude Code Issues

#### Problem: Claude Code generates incorrect documentation

**Solutions:**

- Provide more context in your prompt
- Ask Claude Code to read the actual code first
- Verify output against codebase
- Iterate with corrections
- For financial logic, always manually review

**Example iteration:**

```
# Initial prompt
"Document the calculateOptimalAllocation function"

# If output is generic, follow up with:
"Please read the actual implementation of calculateOptimalAllocation in packages/optimization/src/services/OptimizationService.ts and document the specific algorithm used, including the FSCS compliance checks and rate optimization logic"
```

#### Problem: TSDoc comments are generic

**Solutions:**

- Ask for more detailed comments
- Provide examples of good comments
- Specify what information to include

**Better prompt:**

```
Add TSDoc comments to calculateOptimalAllocation() including:
- @param descriptions explaining the structure of each parameter
- @returns description explaining the allocation format
- @throws documenting when OptimizationError is thrown
- @example showing a complete usage example with sample data
- Implementation notes explaining the optimization algorithm
```

---

## Key Commands Summary

### Development

```bash
npm run docs:dev           # Start Docusaurus dev server
npm run docs:generate      # Regenerate API docs with TypeDoc
```

### Quality

```bash
npm run lint:md            # Lint markdown
npm run lint:md:fix        # Fix markdown issues
npm run format             # Format all files
npm run diagram:validate   # Validate Mermaid diagrams
```

### Deployment

```bash
npm run docs:build         # Build production site
netlify deploy --prod      # Deploy to Netlify
```

### Database Schema

```bash
# After exporting from DbSchema
cp /path/to/Schema-doc.md docs/database/
cp /path/to/MainDiagram.svg docs/database/
cd packages/docs
cp ../../docs/database/Schema-doc.md docs/database/schema.md
cp ../../docs/database/MainDiagram.svg static/database/
cd ../..
npm run docs:build
netlify deploy --prod
```

---

## Time Investment

### Daily Maintenance

- **5-10 minutes per coding session**
  - Write code
  - Ask Claude Code for TSDoc
  - Commit (git hooks run automatically)

### Weekly Maintenance

- **15-30 minutes per week**
  - Regenerate API docs
  - Lint and fix markdown
  - Validate diagrams
  - Rebuild and deploy

### Per-Release Documentation

- **1-2 hours**
  - Version documentation
  - Update CHANGELOG
  - Write release notes
  - Update migration guides

### Database Schema Updates

- **15-30 minutes** (when schema changes)
  - Export from DbSchema
  - Copy files
  - Rebuild and deploy

---

## Success Metrics

Your documentation is successful when:

1. **Claude Code understands your codebase** - Can answer questions accurately
2. **You don't struggle with your own code** - Can understand code after breaks
3. **New contributors onboard quickly** - Clear setup and architecture docs
4. **API changes are documented** - TypeDoc stays current
5. **Compliance is documented** - Financial logic explained with formulas
6. **Deployment is automated** - Docs update on every push

---

## What's Next?

Now that you understand manual maintenance workflows:

1. **Make it a habit** - Document as you code, don't defer
2. **Set up reminders** - Weekly maintenance calendar event
3. **Consider automation** - See [AUTOMATION-PLAN.md](./AUTOMATION-PLAN.md) for experimental automation with Claude Code subagents
4. **Share with team** - Make sure everyone knows the workflows

Remember: These manual workflows always work. Automation is optional and experimental.
