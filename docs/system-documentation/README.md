# Documentation Guides

This directory contains three comprehensive guides for documenting the Cash Management V2 monorepo:

## 📚 Guide Overview

| Guide                                              | Purpose                                     | When to Use                          | Size        |
| -------------------------------------------------- | ------------------------------------------- | ------------------------------------ | ----------- |
| **[SETUP-GUIDE.md](./SETUP-GUIDE.md)**             | Initial setup and first documentation suite | Once during initial implementation   | ~2000 lines |
| **[MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md)** | Daily/weekly manual workflows               | Ongoing reference during development | ~750 lines  |
| **[AUTOMATION-PLAN.md](./AUTOMATION-PLAN.md)**     | Automated maintenance with subagents        | Optional enhancement (experimental)  | ~1400 lines |

---

## 🚀 Getting Started

### If you're setting up documentation for the first time:

**Start here:** [SETUP-GUIDE.md](./SETUP-GUIDE.md)

This guide walks you through:

- Installing all required tools (TypeDoc, Docusaurus, Prettier, etc.)
- Creating root and package-level CLAUDE.md files
- Setting up architecture diagrams
- Integrating database schema documentation
- Deploying to Netlify

**Time investment:** 10.5-15.5 hours (one-time)

---

### If documentation is already set up:

**Daily reference:** [MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md)

Use this guide for:

- Quick command reference
- Daily development workflows
- Weekly maintenance tasks
- Database schema updates
- Troubleshooting common issues

**Time investment:** 5-10 minutes per coding session

---

### If you want to automate documentation maintenance:

**Experimental:** [AUTOMATION-PLAN.md](./AUTOMATION-PLAN.md)

This guide covers:

- Subagent specifications for automated documentation
- Hook system design
- Implementation phases (6 weeks)
- Testing and validation
- Cost/benefit analysis

**Status:** Experimental - manual workflows always work as fallback

---

## 📖 The Documentation System

This monorepo uses a hybrid AI + manual documentation approach:

```
Documentation Stack:
┌─────────────────────────────────────────┐
│ CLAUDE.md Files                         │  ← AI context (Claude Code)
├─────────────────────────────────────────┤
│ TSDoc Comments                          │  ← Inline documentation
├─────────────────────────────────────────┤
│ TypeDoc                                 │  ← API reference generator
├─────────────────────────────────────────┤
│ Mermaid Diagrams                        │  ← Architecture visualization
├─────────────────────────────────────────┤
│ Database Schema (DbSchema)              │  ← Data model documentation
├─────────────────────────────────────────┤
│ Docusaurus                              │  ← Documentation website
├─────────────────────────────────────────┤
│ Netlify                                 │  ← Hosting & deployment
└─────────────────────────────────────────┘
```

### Key Features

✅ **AI-Friendly** - CLAUDE.md files help AI assistants understand your codebase
✅ **Developer-Friendly** - Standard TypeDoc/TSDoc workflow
✅ **User-Friendly** - Searchable Docusaurus website
✅ **Free** - All tools are open source, Netlify free tier
✅ **Automated** - Git hooks, CI/CD, optional subagent automation

---

## 🎯 Progressive Enhancement Model

```
Start → SETUP-GUIDE.md
         ↓
         Documentation created
         ↓
Daily → MAINTENANCE-GUIDE.md (Manual workflows)
         ↓
         Learn what's tedious
         ↓
Optional → AUTOMATION-PLAN.md (Automate 95%)
         ↓
         If automation fails → Back to MAINTENANCE-GUIDE.md
```

**Key principle:** Manual workflows always work. Automation is optional enhancement.

---

## 📁 What's in This Directory

```
docs/
├── README.md                    (This file - Start here)
├── SETUP-GUIDE.md              (Initial setup - Use once)
├── MAINTENANCE-GUIDE.md        (Daily workflows - Always valid)
├── AUTOMATION-PLAN.md          (Automation design - Experimental)
├── IMPLEMENTATION-PLAN.md      (Original combined doc - Archived)
│
├── database/
│   ├── Schema-doc.md          (Auto-generated from DbSchema)
│   └── MainDiagram.svg        (Database ER diagram)
│
├── electron-app/              (Electron app documentation)
├── optimisation/              (Optimization package docs)
├── packaging-and-distribution/
├── system-version-management/
├── testing/
└── archived/                  (Old documentation)
```

---

## 🎓 Documentation Principles

### 1. Document as You Code

Don't defer documentation. When you write a complex function, document it immediately while context is fresh.

### 2. AI Assists, Humans Verify

Claude Code can help write documentation, but you must verify accuracy - especially for financial logic.

### 3. Automation Over Manual Work

Let tools handle formatting, linting, and generation. Focus on strategic documentation.

### 4. Version with Code

Documentation lives in the monorepo and versions alongside code.

### 5. Manual Baseline Always Works

Automation is enhancement, not requirement. MAINTENANCE-GUIDE.md always provides fallback.

---

## 🔧 Quick Commands

```bash
# Generate API documentation
npm run docs:generate

# Start documentation dev server
npm run docs:dev

# Build production documentation
npm run docs:build

# Deploy to Netlify
netlify deploy --prod

# Format all files
npm run format

# Validate Mermaid diagrams
npm run diagram:validate
```

See [MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md) for complete command reference.

---

## 💰 Cost Breakdown

| Item                                               | Cost                       |
| -------------------------------------------------- | -------------------------- |
| Tools (TypeDoc, Docusaurus, Prettier, Husky, etc.) | **$0** (all open source)   |
| Netlify hosting                                    | **$0** (free tier)         |
| AI assistance (Claude Code)                        | Your existing subscription |
| **Total additional cost**                          | **$0**                     |

**Time investment:**

- Initial setup: 10.5-15.5 hours (one-time)
- Daily maintenance: 5-10 minutes per coding session
- Weekly maintenance: 15-30 minutes
- Automation implementation: 6 weeks (optional)

---

## 📞 Getting Help

### For setup questions:

See [SETUP-GUIDE.md → Troubleshooting](./SETUP-GUIDE.md#troubleshooting)

### For maintenance issues:

See [MAINTENANCE-GUIDE.md → Troubleshooting](./MAINTENANCE-GUIDE.md#troubleshooting)

### For automation questions:

See [AUTOMATION-PLAN.md → Fallback Procedures](./AUTOMATION-PLAN.md#fallback-procedures)

### Using Claude Code:

Ask Claude Code for help:

```
"Please add TSDoc comments to all public methods in this file"
"Update packages/pipeline/CLAUDE.md to reflect the new validation service"
"Create a Mermaid diagram showing the scraper execution flow"
```

---

## 🏆 Success Metrics

Your documentation is successful when:

1. ✅ **Claude Code understands your codebase** - Can answer questions accurately
2. ✅ **You don't struggle with your own code** - Can understand code after breaks
3. ✅ **New contributors onboard quickly** - Clear setup and architecture docs
4. ✅ **API changes are documented** - TypeDoc stays current
5. ✅ **Compliance is documented** - Financial logic explained with formulas
6. ✅ **Deployment is automated** - Docs update on every push (or easily)

---

## 📚 Additional Resources

- [TypeDoc](https://typedoc.org/) - API documentation generator
- [Docusaurus](https://docusaurus.io/) - Documentation website framework
- [Mermaid](https://mermaid.js.org/) - Diagram syntax and renderer
- [Netlify](https://docs.netlify.com/) - Hosting and deployment
- [TSDoc](https://tsdoc.org/) - TypeScript documentation standard
- [DbSchema](https://dbschema.com/) - Database schema documentation tool

---

**Ready to get started?** → [SETUP-GUIDE.md](./SETUP-GUIDE.md)

**Already set up?** → [MAINTENANCE-GUIDE.md](./MAINTENANCE-GUIDE.md)

**Want automation?** → [AUTOMATION-PLAN.md](./AUTOMATION-PLAN.md)
