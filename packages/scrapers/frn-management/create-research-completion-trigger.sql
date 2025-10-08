-- FRN Research Completion Trigger
-- Automatically moves completed FRN research from frn_research_temp to frn_manual_overrides
-- Includes FRN format validation (6 or 7 digits only)

.print "Creating FRN research completion trigger..."

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS complete_frn_research;

-- Create the trigger
CREATE TRIGGER complete_frn_research
AFTER UPDATE OF researched_frn ON frn_research_temp
FOR EACH ROW
WHEN NEW.researched_frn IS NOT NULL 
  AND OLD.researched_frn IS NULL
  AND NEW.researched_frn != ''
BEGIN
  -- Validate FRN format (6 or 7 digits only)
  SELECT CASE 
    WHEN LENGTH(NEW.researched_frn) NOT BETWEEN 6 AND 7 THEN
      RAISE(ABORT, 'Invalid FRN format: FRN must be exactly 6 or 7 digits long.')
    WHEN NEW.researched_frn NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]' 
      AND NEW.researched_frn NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN
      RAISE(ABORT, 'Invalid FRN format: FRN must contain only digits.')
  END;
  
  -- Insert into manual overrides (use INSERT OR REPLACE to handle duplicates)
  INSERT OR REPLACE INTO frn_manual_overrides (
    scraped_name,
    frn,
    firm_name,
    confidence_score,
    notes
  ) VALUES (
    NEW.bank_name,
    NEW.researched_frn,
    COALESCE(NEW.researched_firm_name, NEW.bank_name),
    1.0,
    COALESCE(NEW.research_notes, '') || 
      CASE 
        WHEN COALESCE(NEW.research_notes, '') != '' THEN 
          ' [Manually researched ' || DATE('now') || ']'
        ELSE 
          'Manually researched ' || DATE('now')
      END
  );
  
  -- Delete the completed entry from research queue
  DELETE FROM frn_research_temp WHERE rowid = NEW.rowid;
END;

.print "✅ FRN research completion trigger created successfully!"
.print ""
.print "Usage: UPDATE frn_research_temp SET researched_frn = '123456' WHERE bank_name = 'Example Bank';"
.print "This will automatically:"
.print "  1. Validate FRN is 6-7 digits"
.print "  2. Add to frn_manual_overrides"
.print "  3. Remove from frn_research_temp"
.print ""