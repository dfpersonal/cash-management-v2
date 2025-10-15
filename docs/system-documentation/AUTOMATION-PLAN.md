# Documentation Automation Plan

**Purpose:** Design and implement automated documentation maintenance using Claude Code subagents
**Status:** Planning/Experimental
**Prerequisite:** Complete [SETUP-GUIDE.md](./SETUP-GUIDE.md) and understand [MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md)

**Important:** This is experimental. The MAINTENANCE-GUIDE.md always works as a fallback.

---

## Table of Contents

1. [Vision & Goals](#vision--goals)
2. [What Can Be Automated](#what-can-be-automated)
3. [Subagent Architecture](#subagent-architecture)
4. [Subagent Specifications](#subagent-specifications)
5. [Hook System Design](#hook-system-design)
6. [Implementation Phases](#implementation-phases)
7. [Testing Strategy](#testing-strategy)
8. [Fallback Procedures](#fallback-procedures)
9. [Cost Analysis](#cost-analysis)
10. [Success Criteria](#success-criteria)

---

## Vision & Goals

### Current State (Manual)

Based on MAINTENANCE-GUIDE.md, maintaining documentation currently requires:

- Adding TSDoc comments after writing code
- Updating CLAUDE.md files when patterns change
- Regenerating API docs
- Updating architecture diagrams
- Validating examples
- **~5-10 minutes per coding session**

### Target State (Automated)

With subagents:

- Hooks detect changes automatically
- Specialized agents handle documentation tasks
- You review changes before commit
- **~30 seconds per coding session** (review only)

### Success Criteria

- ✅ 95% of documentation tasks automated
- ✅ Manual workflows (MAINTENANCE-GUIDE.md) still work
- ✅ Clear fallback when automation fails
- ✅ Cost-effective (agent tokens < manual time value)
- ✅ Human review for financial logic
- ✅ No accidental commits of incomplete docs

---

## What Can Be Automated

### Tier 1: Fully Automated (No AI needed)

✅ Already works with simple commands:

- Regenerate API docs (`npm run docs:generate`)
- Format files (`npm run format`)
- Lint markdown (`npm run lint:md:fix`)
- Validate diagrams (`npm run diagram:validate`)
- Build docs site (`npm run docs:build`)

**No AI needed - these are deterministic operations**

### Tier 2: AI-Automated (Subagents)

🤖 Can be handled by specialized agents:

#### documentation-maintainer

- Add TSDoc comments to new/modified TypeScript code
- Update TSDoc when function signatures change
- Ensure examples in TSDoc match actual implementation
- Flag financial logic for human review

#### architecture-documenter

- Update CLAUDE.md when package structure changes
- Update architecture diagrams when relationships change
- Create diagrams for new architectural patterns
- Document new packages automatically

#### example-validator

- Verify code examples still compile
- Update examples when APIs change
- Create examples for new public APIs
- Ensure examples follow current patterns

#### database-monitor

- Detect schema changes (table additions, column changes)
- Remind developer to export schema from DbSchema
- Validate schema documentation is up-to-date
- Update database overview documentation

### Tier 3: Manual Only (Cannot automate)

❌ Requires human judgment:

- **Database schema export** - DbSchema GUI operation
- **Financial logic review** - Domain expertise required
- **Production deployment approval** - Business decision
- **Architecture decisions (ADRs)** - Strategic thinking
- **Breaking change decisions** - Impact analysis
- **Release notes content** - User communication

---

## Subagent Architecture

### Design Principles

1. **Specialized expertise** - Each agent handles specific documentation type
2. **Limited tool access** - Agents only get tools they need
3. **Isolated execution** - Agents don't interfere with each other
4. **Clear responsibilities** - No overlap between agents
5. **Fallback to manual** - Human can always do the task
6. **Review before commit** - All changes staged, never auto-committed

### Agent Communication Flow

```
Post-task hook detects changes
    ↓
Hook analyzes what changed (TypeScript? Diagrams? Examples?)
    ↓
Hook launches appropriate agent(s)
    ├─→ documentation-maintainer (if .ts/.tsx files changed)
    ├─→ architecture-documenter (if structure changed)
    ├─→ example-validator (if public APIs changed)
    └─→ database-monitor (if schema files changed)
    ↓
Agents work in parallel (where possible)
    ↓
Hook runs standard commands (format, lint, build)
    ↓
All changes staged for review
    ↓
Human reviews git diff
    ↓
Human commits (or fixes and commits)
```

### Tool Access Matrix

| Agent                    | Read | Write | Bash | Grep | Glob | Edit |
| ------------------------ | ---- | ----- | ---- | ---- | ---- | ---- |
| documentation-maintainer | ✅   | ❌    | ✅   | ✅   | ✅   | ✅   |
| architecture-documenter  | ✅   | ❌    | ✅   | ✅   | ✅   | ✅   |
| example-validator        | ✅   | ✅    | ✅   | ✅   | ✅   | ✅   |
| database-monitor         | ✅   | ✅    | ✅   | ✅   | ✅   | ✅   |

**Note:** No agent should commit to git. All changes are staged for human review.

---

## Subagent Specifications

### 1. documentation-maintainer

**Responsibility:** Maintain TSDoc comments in TypeScript/TypeScript React files

**Triggers:**

- Any `.ts` or `.tsx` file modified
- Any new `.ts` or `.tsx` file created
- Changes to function signatures in existing files

**Process:**

1. **Detect changes**

   ```bash
   git diff --name-only HEAD | grep -E '\.(ts|tsx)$'
   ```

2. **Analyze modified functions**
   - Parse TypeScript AST to find exported functions/classes
   - Check if TSDoc comments exist
   - Check if existing TSDoc matches current signature

3. **Add/update TSDoc**
   - Add missing TSDoc comments
   - Update outdated @param/@returns
   - Add @example if public API
   - Flag financial logic with @remarks for human review

4. **Validate**
   ```bash
   # Check TypeScript compiles
   npx tsc --noEmit
   # Run ESLint with JSDoc plugin
   npx eslint --ext .ts,.tsx --fix
   ```

**Tool Restrictions:**

- ✅ Can read TypeScript files
- ✅ Can edit files (add TSDoc)
- ✅ Can run tsc, eslint
- ❌ Cannot modify non-comment code
- ❌ Cannot commit to git

**Output:**

- Modified `.ts`/`.tsx` files with TSDoc comments
- Stage files with `git add`
- Print summary: "Added TSDoc to X functions in Y files"

**Example Prompt Template:**

```
You are documentation-maintainer, a specialized agent for adding TSDoc comments.

Task: Add TSDoc comments to modified TypeScript files

Files changed:
{list of .ts/.tsx files from git diff}

Requirements:
1. Read each modified file
2. Find exported functions/classes without TSDoc
3. Add comprehensive TSDoc including:
   - Brief description
   - @param for each parameter
   - @returns description
   - @throws if applicable
   - @example for public APIs
4. Flag financial logic with @remarks "Requires human review for financial accuracy"
5. Do NOT modify implementation code
6. Stage changes with git add

Output format:
- List files modified
- Summary of functions documented
```

---

### 2. architecture-documenter

**Responsibility:** Maintain CLAUDE.md files and architecture diagrams

**Triggers:**

- New package created (`packages/*/package.json` added)
- Package structure changed (new directories in `packages/*`)
- Major architectural changes (detected by file patterns)
- New dependencies added (`package.json` modified)

**Process:**

1. **Detect structural changes**

   ```bash
   # New packages
   git diff --name-only HEAD | grep 'packages/.*/package.json'

   # New directories
   git diff --summary HEAD | grep 'create mode.*packages/'

   # Updated dependencies
   git diff HEAD -- '*/package.json'
   ```

2. **Analyze impact**
   - If new package: Create CLAUDE.md, update root CLAUDE.md
   - If structure changed: Update relevant CLAUDE.md
   - If dependencies changed: Update dependency diagrams

3. **Update documentation**
   - Create/update CLAUDE.md files
   - Update Mermaid diagrams (monorepo-structure.md)
   - Update Docusaurus package pages

4. **Validate**
   ```bash
   # Validate diagrams
   npm run diagram:validate
   # Check markdown
   npm run lint:md
   ```

**Tool Restrictions:**

- ✅ Can read all files
- ✅ Can edit CLAUDE.md and diagram files
- ✅ Can create new documentation files
- ❌ Cannot modify source code
- ❌ Cannot commit to git

**Output:**

- Updated CLAUDE.md files
- Updated Mermaid diagrams
- Stage files with `git add`
- Print summary: "Updated documentation for X package changes"

**Example Prompt Template:**

```
You are architecture-documenter, a specialized agent for maintaining CLAUDE.md files and architecture diagrams.

Task: Update documentation for structural changes

Changes detected:
{git diff summary}

Requirements:
1. If new package:
   - Create packages/{name}/CLAUDE.md
   - Update root CLAUDE.md Repository Structure section
   - Update docs/architecture/monorepo-structure.md diagram
   - Create packages/docs/docs/packages/{name}.md

2. If package structure changed:
   - Update relevant CLAUDE.md Package Structure section

3. If dependencies changed:
   - Update dependency diagram
   - Update CLAUDE.md Dependencies section

4. Validate all changes:
   - npm run diagram:validate
   - npm run lint:md

5. Stage changes with git add

Output format:
- List files modified/created
- Summary of documentation updates
```

---

### 3. example-validator

**Responsibility:** Maintain code examples in `examples/` directory

**Triggers:**

- Public API signatures change
- Examples fail to compile
- New public APIs added (exported functions/classes)
- Manual request (file created in `examples/`)

**Process:**

1. **Detect API changes**

   ```bash
   # Modified public APIs
   git diff HEAD -- 'packages/*/src/**/*.ts' | grep -E '^[\+\-]export'

   # Check example compilation
   npx tsc --noEmit examples/*.ts examples/*.tsx
   ```

2. **Analyze impact**
   - List affected examples
   - Identify new APIs needing examples

3. **Update/create examples**
   - Fix broken examples (signature changes)
   - Create examples for new APIs
   - Update example comments

4. **Validate**
   ```bash
   # Test TypeScript
   npx tsc --noEmit examples/*.ts examples/*.tsx
   # Test JavaScript
   node --check examples/*.js
   # Format
   npm run format
   ```

**Tool Restrictions:**

- ✅ Can read source code
- ✅ Can read/write example files
- ✅ Can create new examples
- ✅ Can run tsc, node
- ❌ Cannot modify source code
- ❌ Cannot commit to git

**Output:**

- Updated/created example files
- Stage files with `git add`
- Print summary: "Updated X examples, created Y new examples"

**Example Prompt Template:**

```
You are example-validator, a specialized agent for maintaining code examples.

Task: Validate and update code examples

Changes detected:
{list of API changes from git diff}

Requirements:
1. Check all examples compile:
   npx tsc --noEmit examples/*.ts examples/*.tsx
   node --check examples/*.js

2. Fix broken examples:
   - Update signatures to match new APIs
   - Update import paths if packages moved
   - Preserve explanatory comments

3. Create examples for new public APIs:
   - Look for new exports in packages/*/src/
   - Create working examples showing typical usage
   - Include comprehensive comments

4. Validate:
   - All examples must compile
   - All examples must follow current patterns
   - Format with npm run format

5. Stage changes with git add

Output format:
- List examples fixed
- List examples created
- Compilation status
```

---

### 4. database-monitor

**Responsibility:** Monitor database schema changes and documentation

**Triggers:**

- Schema files modified (`.sql`, migration files)
- Database file timestamp changed
- Manual trigger from developer

**Process:**

1. **Detect schema changes**

   ```bash
   # SQL files changed
   git diff --name-only HEAD | grep -E '\.(sql|db)$'

   # Check if schema docs are stale
   [[ docs/database/Schema-doc.md -ot data/databases/main.db ]]
   ```

2. **Analyze changes**
   - Parse SQL to detect table/column changes
   - Check if schema docs need update

3. **Notify and guide**
   - Print clear instructions for manual export
   - Wait for developer to export from DbSchema
   - Validate exported files exist

4. **Update documentation**
   ```bash
   # Copy to Docusaurus
   cp docs/database/Schema-doc.md packages/docs/docs/database/schema.md
   cp docs/database/MainDiagram.svg packages/docs/static/database/
   ```

**Tool Restrictions:**

- ✅ Can read schema files
- ✅ Can write documentation (after manual export)
- ✅ Can detect changes
- ❌ Cannot export from DbSchema (GUI only)
- ❌ Cannot modify database
- ❌ Cannot commit to git

**Output:**

- Instructions printed to console
- Updated documentation (after manual export)
- Stage files with `git add`

**Example Prompt Template:**

```
You are database-monitor, a specialized agent for database schema documentation.

Task: Monitor and update database schema documentation

Changes detected:
{list of .sql or .db files changed}

Requirements:
1. Detect schema changes:
   - Parse SQL files
   - Compare timestamps

2. If schema changed:
   - Print clear instructions:
     "⚠️  Database schema has changed!

     Please export documentation from DbSchema:
     1. Open database in DbSchema
     2. File → Export → Documentation (Markdown)
     3. Save to temporary directory
     4. Press Enter when ready..."

   - Wait for user input
   - Check files exist in expected location

3. Update documentation:
   cp /path/to/Schema-doc.md docs/database/Schema-doc.md
   cp /path/to/MainDiagram.svg docs/database/MainDiagram.svg
   cp docs/database/Schema-doc.md packages/docs/docs/database/schema.md
   cp docs/database/MainDiagram.svg packages/docs/static/database/

4. Stage changes with git add

Output format:
- Detection summary
- User instructions
- Update confirmation
```

---

## Hook System Design

### Git Hook: post-commit

**Purpose:** Run after successful commit to prepare documentation changes

**Location:** `.husky/post-commit`

**Logic:**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Check if automation is enabled
if [ ! -f .claude-automation-enabled ]; then
  echo "ℹ️  Documentation automation disabled. See AUTOMATION-PLAN.md"
  exit 0
fi

# Run documentation automation orchestrator
node scripts/doc-automation-orchestrator.js
```

**Why post-commit, not pre-commit?**

- Documentation changes should be in **separate commit**
- Allows review of documentation updates
- Prevents failed docs from blocking code commits
- Clear separation: code commit, then docs commit

### Orchestrator Script

**File:** `scripts/doc-automation-orchestrator.js`

**Responsibilities:**

1. Analyze what changed in last commit
2. Decide which agents to run
3. Launch agents in appropriate order
4. Run standard commands (format, lint, build)
5. Stage all changes
6. Print summary for human review

**Pseudo-code:**

```javascript
// Analyze last commit
const changedFiles = execSync("git diff --name-only HEAD~1 HEAD")
  .toString()
  .split("\n");

// Categorize changes
const tsFiles = changedFiles.filter((f) => f.match(/\.(ts|tsx)$/));
const sqlFiles = changedFiles.filter((f) => f.match(/\.(sql|db)$/));
const packageJsons = changedFiles.filter((f) => f.includes("package.json"));
const newPackages = changedFiles
  .filter((f) => f.match(/^packages\/[^\/]+\/package\.json$/))
  .filter(isNew);

// Launch agents
const agents = [];

if (tsFiles.length > 0) {
  agents.push({
    name: "documentation-maintainer",
    prompt: generatePrompt("documentation-maintainer", { files: tsFiles }),
  });
}

if (newPackages.length > 0 || packageJsons.length > 0) {
  agents.push({
    name: "architecture-documenter",
    prompt: generatePrompt("architecture-documenter", {
      changes: packageJsons,
    }),
  });
}

if (tsFiles.length > 0) {
  // Check if examples need updates
  agents.push({
    name: "example-validator",
    prompt: generatePrompt("example-validator", { changedApis: tsFiles }),
  });
}

if (sqlFiles.length > 0) {
  agents.push({
    name: "database-monitor",
    prompt: generatePrompt("database-monitor", { files: sqlFiles }),
  });
}

// Run agents (in parallel where possible)
await runAgents(agents);

// Run standard commands
execSync("npm run docs:generate");
execSync("npm run format");
execSync("npm run lint:md:fix");

// Stage all changes
execSync(
  "git add docs/ packages/docs/ examples/ CLAUDE.md packages/*/CLAUDE.md",
);

// Print summary
console.log(`
✅ Documentation automation complete!

Changes staged:
${execSync("git diff --staged --name-only").toString()}

Please review with: git diff --staged
Then commit: git commit -m "docs: Update documentation"
`);
```

### Configuration File

**File:** `.claude-automation-config.json`

```json
{
  "enabled": true,
  "agents": {
    "documentation-maintainer": {
      "enabled": true,
      "autoRun": true,
      "requireReview": true
    },
    "architecture-documenter": {
      "enabled": true,
      "autoRun": true,
      "requireReview": true
    },
    "example-validator": {
      "enabled": true,
      "autoRun": true,
      "requireReview": false
    },
    "database-monitor": {
      "enabled": true,
      "autoRun": true,
      "requireReview": true
    }
  },
  "thresholds": {
    "maxTokensPerAgent": 50000,
    "maxAgentsPerRun": 4,
    "timeoutSeconds": 300
  },
  "flags": {
    "requireHumanReviewForFinancialLogic": true,
    "stageDontCommit": true,
    "notifyOnFailure": true
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Set up orchestrator and configuration

**Tasks:**

1. Create `.claude-automation-config.json`
2. Create `scripts/doc-automation-orchestrator.js`
3. Create `.husky/post-commit` hook
4. Add enable/disable commands:
   ```bash
   npm pkg set scripts.automation:enable="touch .claude-automation-enabled"
   npm pkg set scripts.automation:disable="rm -f .claude-automation-enabled"
   ```
5. Test hook triggers correctly

**Success criteria:**

- [ ] Hook runs after commit
- [ ] Orchestrator detects file changes correctly
- [ ] Configuration loaded and respected
- [ ] Can enable/disable automation

**Time:** 4-6 hours

---

### Phase 2: documentation-maintainer (Week 2)

**Goal:** Implement TSDoc automation

**Tasks:**

1. Create prompt template for documentation-maintainer
2. Integrate with Claude Code API/CLI
3. Test on sample TypeScript files
4. Add financial logic detection
5. Validate TSDoc with eslint-plugin-jsdoc

**Testing:**

```bash
# Create test file
cat > test-automation.ts << 'EOF'
export function calculateInterest(principal: number, rate: number): number {
  return principal * rate;
}
EOF

# Commit
git add test-automation.ts
git commit -m "test: Add function for TSDoc automation"

# Verify documentation-maintainer ran
git diff --staged

# Should show TSDoc comments added
```

**Success criteria:**

- [ ] TSDoc added to new functions
- [ ] Existing TSDoc updated when signatures change
- [ ] Financial logic flagged for review
- [ ] No implementation code modified

**Time:** 8-10 hours

---

### Phase 3: architecture-documenter (Week 3)

**Goal:** Automate CLAUDE.md and diagram updates

**Tasks:**

1. Create prompt template for architecture-documenter
2. Implement new package detection
3. Implement CLAUDE.md generation
4. Implement Mermaid diagram updates
5. Test with sample package

**Testing:**

```bash
# Create new package
mkdir -p packages/test-package/src
npm init -y -w packages/test-package

# Commit
git add packages/test-package
git commit -m "feat: Add test-package"

# Verify architecture-documenter ran
git diff --staged

# Should show:
# - packages/test-package/CLAUDE.md created
# - root CLAUDE.md updated
# - docs/architecture/monorepo-structure.md updated
```

**Success criteria:**

- [ ] CLAUDE.md created for new packages
- [ ] Root CLAUDE.md updated
- [ ] Diagrams updated correctly
- [ ] Docusaurus pages created

**Time:** 10-12 hours

---

### Phase 4: example-validator (Week 4)

**Goal:** Automate example maintenance

**Tasks:**

1. Create prompt template for example-validator
2. Implement API change detection
3. Implement example compilation checking
4. Implement example generation for new APIs
5. Test with API changes

**Testing:**

```bash
# Change API signature
# Edit packages/shared/src/services/DatabaseService.ts
# Change: query(sql: string)
# To: query(sql: string, params?: any[])

# Commit
git commit -am "feat: Add params to DatabaseService.query()"

# Verify example-validator ran
git diff --staged

# Should show:
# - examples/database-service-usage.ts updated
# - Compilation succeeds
```

**Success criteria:**

- [ ] Broken examples fixed
- [ ] New examples created for new APIs
- [ ] All examples compile
- [ ] Examples follow current patterns

**Time:** 8-10 hours

---

### Phase 5: database-monitor (Week 5)

**Goal:** Monitor schema changes

**Tasks:**

1. Create prompt template for database-monitor
2. Implement schema change detection
3. Implement user guidance flow
4. Implement documentation update
5. Test with schema change

**Testing:**

```bash
# Modify schema
echo "CREATE TABLE test_table (id INTEGER PRIMARY KEY);" > test-migration.sql

# Commit
git add test-migration.sql
git commit -m "feat: Add test_table"

# Verify database-monitor ran
# Should see prompt to export from DbSchema
# After export, should copy files to correct locations
```

**Success criteria:**

- [ ] Schema changes detected
- [ ] Clear instructions printed
- [ ] Documentation updated after export
- [ ] Docusaurus includes new schema

**Time:** 6-8 hours

---

### Phase 6: Integration & Polish (Week 6)

**Goal:** Complete end-to-end testing and documentation

**Tasks:**

1. Test all agents together
2. Optimize orchestrator (parallel execution)
3. Add error handling and recovery
4. Write user documentation
5. Create tutorial videos/guides

**Testing:**

```bash
# Make comprehensive changes
# - Add new function (documentation-maintainer)
# - Create new package (architecture-documenter)
# - Change API (example-validator)
# - Modify schema (database-monitor)

# Commit all
git add .
git commit -m "test: Comprehensive automation test"

# Verify all agents ran correctly
git diff --staged

# Review and commit docs
git commit -m "docs: Automated documentation update"
```

**Success criteria:**

- [ ] All agents work together
- [ ] Parallel execution where possible
- [ ] Errors handled gracefully
- [ ] Fallback to manual works
- [ ] Documentation complete

**Time:** 8-10 hours

---

## Testing Strategy

### Unit Tests

Each agent should be testable independently:

```javascript
// test/agents/documentation-maintainer.test.js
describe("documentation-maintainer", () => {
  it("adds TSDoc to exported functions", async () => {
    const input = `
export function foo(a: number): number {
  return a * 2;
}
    `;

    const result = await runAgent("documentation-maintainer", {
      files: [{ path: "test.ts", content: input }],
    });

    expect(result.files[0].content).toContain("/**");
    expect(result.files[0].content).toContain("@param a");
    expect(result.files[0].content).toContain("@returns");
  });

  it("flags financial logic for review", async () => {
    const input = `
export function calculateFSCS(amount: number): number {
  return Math.min(amount, 85000);
}
    `;

    const result = await runAgent("documentation-maintainer", {
      files: [{ path: "test.ts", content: input }],
    });

    expect(result.files[0].content).toContain("@remarks");
    expect(result.files[0].content).toContain("human review");
  });
});
```

### Integration Tests

Test complete workflows:

```javascript
// test/integration/full-workflow.test.js
describe("full automation workflow", () => {
  it("handles new TypeScript file end-to-end", async () => {
    // Create test file
    await writeFile("test.ts", "export function test() {}");

    // Commit
    await execAsync('git add test.ts && git commit -m "test"');

    // Wait for hook
    await waitForHook();

    // Verify TSDoc added
    const staged = await execAsync("git diff --staged test.ts");
    expect(staged).toContain("/**");

    // Verify API docs regenerated
    expect(fs.existsSync("docs/api/test.md")).toBe(true);

    // Cleanup
    await execAsync("git reset HEAD && git checkout test.ts");
  });
});
```

### Manual Testing Checklist

**Before each release:**

- [ ] Create new TypeScript file → TSDoc added
- [ ] Modify function signature → TSDoc updated
- [ ] Create new package → CLAUDE.md created
- [ ] Change package structure → CLAUDE.md updated
- [ ] Change public API → Example updated
- [ ] Modify schema → Instructions printed
- [ ] Disable automation → Hooks don't run
- [ ] Enable automation → Hooks resume
- [ ] Agent fails → Error handled, manual fallback works

---

## Fallback Procedures

### When Automation Fails

**If agent fails:**

1. **Error is logged** to `.claude-automation-error.log`
2. **User is notified** with clear message:

   ```
   ⚠️  documentation-maintainer failed
   Error: [error message]

   Fallback to manual workflow:
   See MAINTENANCE-GUIDE.md for manual TSDoc instructions
   ```

3. **Orchestrator continues** with other agents
4. **User follows manual workflow** from MAINTENANCE-GUIDE.md

**If orchestrator fails:**

1. **No documentation changes** are staged
2. **User is notified**:

   ```
   ⚠️  Documentation automation failed

   You can:
   1. Fix the error and run: npm run automation:retry
   2. Disable automation: npm run automation:disable
   3. Follow manual workflow: see MAINTENANCE-GUIDE.md
   ```

### Disabling Automation

**Temporary (one commit):**

```bash
# Remove flag file
rm .claude-automation-enabled

# Commit normally
git commit -m "feat: Something"

# Re-enable
touch .claude-automation-enabled
```

**Permanent:**

```bash
# Disable automation
npm run automation:disable

# Or edit config
# Set "enabled": false in .claude-automation-config.json
```

### Emergency Recovery

**If automation committed bad documentation:**

```bash
# Revert last commit
git revert HEAD

# Disable automation
npm run automation:disable

# Fix documentation manually
# Follow MAINTENANCE-GUIDE.md

# Re-enable when ready
npm run automation:enable
```

---

## Cost Analysis

### Token Usage Estimates

**Per agent per run:**

- **documentation-maintainer:** ~5,000-10,000 tokens
  - Input: Function signatures, existing TSDoc
  - Output: Complete TSDoc comments
- **architecture-documenter:** ~10,000-20,000 tokens
  - Input: Package structure, dependencies
  - Output: CLAUDE.md content, Mermaid diagrams
- **example-validator:** ~5,000-15,000 tokens
  - Input: API signatures, existing examples
  - Output: Updated examples
- **database-monitor:** ~2,000-5,000 tokens
  - Input: Schema changes
  - Output: Instructions, documentation updates

**Average per coding session:**

- Typical: 1-2 agents run
- Tokens: 10,000-30,000
- Cost: ~$0.03-$0.09 (at current Claude rates)

**Monthly estimate:**

- 5 coding sessions/week × 4 weeks = 20 sessions
- 20 × 20,000 tokens average = 400,000 tokens
- Cost: ~$1.20-$3.60/month

**Comparison to manual:**

- Manual: 5-10 min/session × 20 sessions = 100-200 min/month
- Automated: 30 sec/session × 20 sessions = 10 min/month
- **Time saved: 90-190 minutes/month**
- **Cost: $1.20-$3.60/month**
- **Value: $30-$60/month** (at $20/hour)
- **ROI: 8-50x**

### Cost Controls

**Configure in `.claude-automation-config.json`:**

```json
{
  "thresholds": {
    "maxTokensPerAgent": 50000,
    "maxTokensPerMonth": 500000,
    "alertAtTokens": 400000
  }
}
```

**Monitoring:**

```bash
# Check token usage
cat .claude-automation-usage.json

# Output:
# {
#   "month": "2025-10",
#   "tokens": 245000,
#   "sessions": 15,
#   "averagePerSession": 16333
# }
```

---

## Success Criteria

### Metrics to Track

**Automation success:**

- ✅ **Coverage:** % of documentation tasks automated (target: 95%)
- ✅ **Accuracy:** % of automated docs that pass review (target: 90%)
- ✅ **Time saved:** Minutes saved per week (target: 90+ min/month)
- ✅ **Cost effectiveness:** ROI > 5x (value of time saved vs cost)

**Quality metrics:**

- ✅ **TSDoc coverage:** % of public APIs with TSDoc (target: 100%)
- ✅ **Example compilation:** % of examples that compile (target: 100%)
- ✅ **Diagram validity:** % of diagrams that validate (target: 100%)
- ✅ **Documentation freshness:** Docs < 1 week old (target: 95%)

**Developer satisfaction:**

- ✅ **Adoption rate:** % of team using automation (target: 80%)
- ✅ **Manual fallback usage:** < 20% of sessions
- ✅ **Error rate:** < 5% of automation runs fail
- ✅ **Review time:** < 2 minutes per session

### Evaluation Period

**After 1 month:**

- Review metrics
- Collect developer feedback
- Decide: continue, modify, or pause automation

**Questions to answer:**

1. Is automation saving time?
2. Is documentation quality improved?
3. Are costs acceptable?
4. Are developers satisfied?
5. Are manual fallbacks working?

---

## Getting Started

### Prerequisites

1. ✅ Complete [SETUP-GUIDE.md](./SETUP-GUIDE.md)
2. ✅ Understand [MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md)
3. ✅ Manual workflows working correctly
4. ✅ Claude Code subscription active

### Quick Start

```bash
# 1. Enable automation
npm run automation:enable

# 2. Make a code change
echo "export function test() {}" > test.ts
git add test.ts
git commit -m "test: Verify automation"

# 3. Wait for post-commit hook
# Should see: "🤖 Running documentation automation..."

# 4. Review staged changes
git diff --staged

# 5. Commit documentation updates
git commit -m "docs: Automated documentation update"

# 6. Done!
```

### Troubleshooting

**Automation not running?**

```bash
# Check enabled
ls -la .claude-automation-enabled

# Check config
cat .claude-automation-config.json

# Check hook installed
cat .husky/post-commit
```

**Automation failed?**

```bash
# Check error log
cat .claude-automation-error.log

# Disable and use manual workflow
npm run automation:disable

# Follow MAINTENANCE-GUIDE.md
```

---

## Future Enhancements

### Potential Additions

**Enhanced agents:**

- **changelog-generator** - Auto-generate CHANGELOG.md entries
- **release-notes-writer** - Draft release notes from commits
- **test-documenter** - Add documentation to test files
- **migration-guide-updater** - Update migration guides for breaking changes

**Smarter orchestration:**

- **Dependency analysis** - Run agents in optimal order
- **Incremental updates** - Only process changed portions
- **Parallel execution** - Run independent agents simultaneously
- **Cost optimization** - Batch small changes to reduce API calls

**Better integration:**

- **IDE plugins** - Run automation from VS Code
- **PR checks** - Verify documentation in CI/CD
- **Slack notifications** - Alert team of documentation updates
- **Dashboard** - Visualize automation metrics

### Research Areas

**Open questions:**

1. Can agents learn project-specific patterns over time?
2. Can we reduce token usage with caching?
3. Can we detect when automation is performing poorly?
4. Can agents suggest architectural improvements?
5. Can we automate deployment decisions?

---

## Conclusion

Documentation automation with Claude Code subagents is **experimental but promising**:

✅ **Benefits:**

- Saves 90+ minutes/month
- Improves documentation consistency
- Reduces human error
- Costs ~$1-4/month

⚠️ **Risks:**

- May generate incorrect documentation
- Requires token budget
- Needs human review
- Adds complexity

🛡️ **Safety nets:**

- Manual workflows always work (MAINTENANCE-GUIDE.md)
- No auto-commits (human reviews all changes)
- Financial logic flagged for review
- Easy to disable/fallback

**Recommendation:** Start with **Phase 1-2** (foundation + TSDoc automation). Evaluate after 1 month. Expand if successful.

**Remember:** Automation is optional. The manual workflows in MAINTENANCE-GUIDE.md are the source of truth and always work.

---

## Additional Resources

### Documentation

- [SETUP-GUIDE.md](./SETUP-GUIDE.md) - Initial setup
- [MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md) - Manual workflows
- [Claude Code Documentation](https://docs.anthropic.com/claude-code) - API reference

### Community

- GitHub Discussions - Share automation patterns
- Discord - Ask questions, get help
- Stack Overflow - Technical Q&A

### Related Projects

- [typedoc](https://typedoc.org/) - API documentation generator
- [Docusaurus](https://docusaurus.io/) - Documentation site builder
- [Mermaid](https://mermaid.js.org/) - Diagram generation

---

**End of Automation Plan**

Ready to experiment? Start with [Implementation Phases](#implementation-phases) above!
