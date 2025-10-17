# Cash Savings Optimization Analysis - Standing Brief

## Database Location
**Path:** `/Users/david/Websites/cash-management-v2/data/database/cash_savings.db`

**Key Tables:**
- `my_deposits` - Current holdings
- `available_products` - Available savings products from scrapers

---

## Objective
Optimize cash savings allocation by moving funds from easy access accounts to 6-month fixed term accounts with the best available rates, while respecting FSCS limits and platform preferences.

---

## Analysis Parameters

### 1. Source Accounts
**Include:**
- Easy Access accounts (`sub_type = 'Easy Access'`)
- With balance > £1,000
- Where `is_active = 1`

**Exclude from analysis:**
- Accounts with balance ≤ £1,000 (leave as buffer accounts)

### 2. Emergency Fund Requirement
**Keep £100,000 in easy access for emergencies**
- This is typically held in NS&I (FRN: 845350) which is government-backed
- Calculate available funds: `Total Easy Access - £100,000 = Available to Move`

### 3. Target Product Type
**6-month fixed term accounts only**
- `account_type = 'fixed_term'`
- `term_months = 6`
- Rationale: Push interest payments into next tax year (April 2026)

### 4. FSCS Protection Rules
**£85,000 limit per FRN (Financial Services Register Number)**
- Multiple accounts with same bank/FRN count toward single limit
- NS&I (FRN: 845350) is government-backed = unlimited protection
- When recommending moves, calculate current FRN exposure across ALL accounts (not just easy access)
- Only recommend moves that keep total FRN exposure ≤ £85,000
- Exception: If currently over limit, flag but don't prevent optimization

**Current FRN exposure calculation:**
```sql
SELECT frn, bank, SUM(balance) as total_exposure 
FROM my_deposits 
WHERE is_active = 1 
GROUP BY frn, bank 
ORDER BY total_exposure DESC;
```

### 5. Platform Preferences
**Preferred platforms (in order):**
1. Flagstone
2. Prosper
3. Hargreaves Lansdowne / HL Active Savings
4. AJ Bell

**Platform vs Direct Trade-off:**
- Accept up to **0.25% lower rate** for platform accounts vs direct
- If direct rate is **0.25% or more higher**, recommend direct account
- Always calculate and show the annual £ benefit/cost of the trade-off

**Example:**
- Direct: 4.45% vs Platform: 4.21% = 0.24% difference
- On £85,000: 0.24% = £204/year extra
- Since 0.24% < 0.25%, platform is preferred UNLESS the £204 is considered significant

### 6. Product Selection Criteria
**When finding best 6-month rates:**
```sql
SELECT bank_name, aer_rate, frn, platform, min_deposit, max_deposit 
FROM available_products 
WHERE account_type = 'fixed_term' 
  AND term_months = 6 
  AND aer_rate > 0 
ORDER BY aer_rate DESC;
```

**Prioritize products with:**
- Known FRN (for FSCS verification)
- Preferred platforms where rate is within 0.25% of best direct rate
- New FRNs (for diversification) over existing FRNs at limit

**Avoid products with:**
- No FRN data (cannot verify FSCS protection)
- FRNs already at £85,000 limit (unless same institution move)
- Sharia-compliant banks (check `sharia_banks` table if needed)

---

## Analysis Workflow

### Step 1: Establish Current Position
1. Query all easy access accounts with balance > £1,000
2. Calculate total available to move (Total EA - £100,000)
3. Query current FRN exposure across entire portfolio
4. Identify institutions at/over £85,000 limit
5. Calculate available headroom by FRN

### Step 2: Identify Best 6-Month Products
1. Query all 6-month fixed term products
2. Separate into Platform vs Direct options
3. For platform options: filter to preferred platforms only
4. Calculate rate differential between best direct and best platform options
5. Flag any products missing FRN data

### Step 3: Build Optimization Strategy
**Prioritization logic:**
1. **First tier:** Platform accounts within 0.25% of best rate
   - Start with highest rates
   - Respect FSCS headroom limits
   
2. **Second tier:** Direct accounts with 0.25%+ premium
   - Calculate annual £ benefit to justify
   - Show trade-off clearly
   
3. **Third tier:** Additional allocations to hit target amount
   - May include same-rate moves for term locking
   - Focus on FRN diversification

**For each recommendation:**
- Source account (bank, current rate, balance)
- Destination (bank, platform, new rate, FRN)
- Amount to move (respecting FSCS limits)
- Annual benefit (rate improvement × amount ÷ 100)
- FRN status (new/existing, headroom remaining)
- Priority rating (High/Medium/Low)

### Step 4: Calculate Benefits
- Total annual interest gain from rate improvements
- Number of new FRNs added (diversification)
- FSCS compliance improvements
- Platform usage summary

### Step 5: Implementation Guidance
**Organize by priority:**
- **Urgent:** Best rates, closing soon, or large improvements
- **High:** Significant rate improvements (>0.15%)
- **Medium:** Modest improvements, diversification
- **Low:** Same-rate moves, term locking only

**Flag considerations:**
- Accounts already at excellent rates (keep for liquidity?)
- Promotional rates to preserve (e.g., Zopa 7.5%)
- Accounts that should remain as emergency buffers

---

## Output Format

### Required Sections:

1. **Executive Summary**
   - Total easy access balance
   - Emergency fund amount
   - Available to move
   - Total recommended to move

2. **Current FSCS Exposure Analysis**
   - Table of institutions at/over limit
   - Table of institutions with headroom
   - Flag any compliance issues

3. **Best 6-Month Products**
   - Platform options (preferred platforms only)
   - Direct options
   - Show rate comparison and headroom for each

4. **Recommended Reallocation Strategy**
   - Detailed move-by-move plan
   - Source → Destination with amounts
   - Rate improvement and annual benefit for each
   - Running FRN exposure calculations

5. **Summary Tables**
   - Total movements by source account
   - What stays in easy access and why
   - Total annual benefit

6. **Implementation Priority**
   - Urgent/High/Medium/Low categories
   - Timeline suggestions

7. **Notes & Considerations**
   - Any accounts to keep for specific reasons
   - Timing considerations
   - Application sequencing

---

## Key Decision Points to Clarify

When performing analysis, if uncertain about:

1. **Emergency fund location:** Default to keeping NS&I £100k
2. **Over-limit exposures:** Flag but don't block optimization
3. **Platform vs direct trade-off:** Calculate and show annual £ difference clearly
4. **Accounts with excellent rates:** Flag for review (e.g., 4.5% easy access)
5. **Missing FRN data:** Exclude from recommendations, note as unavailable
6. **Same-rate moves:** Include if beneficial for term-locking or diversification, but mark as lower priority

---

## Standard Queries for Analysis

### Query 1: Easy Access Source Accounts
```sql
SELECT id, bank, sub_type, balance, aer, frn, platform 
FROM my_deposits 
WHERE is_active = 1 
  AND sub_type = 'Easy Access' 
  AND balance > 1000 
ORDER BY balance DESC;
```

### Query 2: Current FRN Exposure
```sql
SELECT frn, bank, SUM(balance) as total_exposure 
FROM my_deposits 
WHERE is_active = 1 AND frn IS NOT NULL
GROUP BY frn, bank 
ORDER BY total_exposure DESC;
```

### Query 3: Best 6-Month Rates (All)
```sql
SELECT bank_name, aer_rate, frn, platform, term_months, min_deposit, max_deposit 
FROM available_products 
WHERE account_type = 'fixed_term' 
  AND term_months = 6 
  AND aer_rate > 0 
ORDER BY aer_rate DESC 
LIMIT 20;
```

### Query 4: Best 6-Month Rates (Preferred Platforms)
```sql
SELECT bank_name, aer_rate, frn, platform 
FROM available_products 
WHERE account_type = 'fixed_term' 
  AND term_months = 6 
  AND platform IN ('flagstone', 'prosper', 'hargreaves lansdowne', 'hl active savings', 'ajbell', 'aj bell') 
  AND aer_rate > 0 
ORDER BY aer_rate DESC;
```

### Query 5: Check Specific Bank Across Platforms
```sql
SELECT bank_name, aer_rate, platform, term_months, account_type 
FROM available_products 
WHERE bank_name LIKE '%[BankName]%' 
ORDER BY aer_rate DESC;
```

---

## Special Considerations

### NS&I Special Status
- FRN: 845350
- Government-backed = unlimited FSCS protection
- Typically used for emergency fund
- Can be excluded from optimization if desired

### High-Rate Anomalies
- Flag any rates that seem unusually high (e.g., >7%)
- These may be promotional rates worth preserving
- Example from previous analysis: Zopa @ 7.5%

### Buffer Accounts
- Accounts under £1,000 typically left as buffers
- May include accounts at institutions already at FSCS limit
- Provides flexibility for small transactions

### Sharia Compliance
- Some users may wish to avoid Islamic finance institutions
- Check `sharia_banks` table if relevant
- Previous analysis: AlRayan Bank is Islamic finance

---

## Version History
- **v1.0** (2025-10-16): Initial brief created after first optimization analysis
- Target completion: 6-month fixed terms for tax year optimization
- Last run: October 2025

---

## Instructions for Claude

When this brief is referenced:

1. **Read the entire brief** to understand all parameters
2. **Execute the standard queries** to gather current data
3. **Follow the analysis workflow** step-by-step
4. **Create output in the specified format** (use the previous analysis as a template)
5. **Highlight key decisions** that differ from parameters (with rationale)
6. **Ask clarifying questions** only if data is unclear or missing

**Do not** ask about:
- Emergency fund amount (£100k)
- Target term (6 months)
- FSCS limit (£85k per FRN)
- Platform preference threshold (0.25% rate tolerance)
- Source account criteria (EA, >£1k, active)

These are standing parameters unless explicitly changed by the user.