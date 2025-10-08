Please read /Users/david/Websites/cash-management/docs/packaging-and-distribution/MIGRATION-BACKGROUND-PROMPT.md

I'm ready to begin the migration. Please help me with Phase 0: Create new repository and initialize monorepo structure.
```

---

## How to Use This Prompt

### For a Brand New Session:

1. **Copy the entire "Session Context Prompt" section** (everything in the code block above)
2. **Paste it into a new Claude Code session**
3. **Add your specific goal** at the bottom where it says "[User specifies current phase or specific task]"

Example additions:
- "Start Phase 0: Create new repository and initialize monorepo structure"
- "Continue Phase 2.2: Migrate pipeline package (I've completed scrapers)"
- "Review current progress and recommend next steps"
- "Help with import statement migration - stuck on TypeScript errors"

### For Resuming Work:

If you're in the middle of migration, add this to the prompt:

```
## Current Progress

**Last Phase Completed**: Phase X.Y - [description]
**Currently Working On**: Phase X.Y - [description]
**Blockers/Issues**: [any current issues]
**Checklist Status**: [e.g., "40% complete, Phase 2.1 in progress"]

Please review the checklist at MONOREPO-MIGRATION-CHECKLIST.md and help me
continue from where I left off.
```

### For Specific Issues:

```
## Issue I'm Facing

**Phase**: [e.g., Phase 3.1 - Main Process]
**Problem**: [describe the issue]
**What I've Tried**: [steps already taken]
**Error Messages**: [any error output]

Please help me resolve this issue while referencing the migration plan.
```

---

## Quick Reference Links

When starting a new session, Claude will load these documents:

| Document | Purpose | When to Reference |
|----------|---------|-------------------|
| MONOREPO-MIGRATION-CHECKLIST.md | Track progress | Every session - update status |
| MONOREPO-FILE-AUDIT.md | Find file destinations | When moving files |
| MONOREPO-MIGRATION-PLAN.md | Implementation details | When you need detailed steps |
| ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md | Post-migration features | Phase 11 (Native Reports) |

---

## Checklist Update Protocol

After each work session:

1. ✅ **Mark completed items** in MONOREPO-MIGRATION-CHECKLIST.md
2. 📝 **Add notes** to relevant phase sections
3. ⚠️ **Document blockers** in Issues & Blockers table
4. 📊 **Update timeline** with actual days spent
5. 🔄 **Update status** at top of checklist

---

## Session End Protocol

Before ending a session, make sure to:

1. ✅ Commit all changes with descriptive messages
2. ✅ Update MONOREPO-MIGRATION-CHECKLIST.md with progress
3. ✅ Document any blockers or issues encountered
4. ✅ Note what should be done next in checklist notes
5. ✅ Run builds/tests to ensure nothing broken

This ensures the next session can pick up seamlessly!

---

**Document Created**: 2025-10-08
**Last Updated**: 2025-10-08
**Status**: Ready for use
