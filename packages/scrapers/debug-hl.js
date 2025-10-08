#!/usr/bin/env node

import puppeteer from 'puppeteer';

async function debugHL() {
  console.log('🔍 Debugging HL page content...');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security'
    ]
  });
  
  const page = await browser.newPage();
  
  // Set realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('📄 Navigating to HL page...');
  await page.goto('https://www.hl.co.uk/savings/latest-savings-rates-and-products', {
    waitUntil: 'networkidle0',
    timeout: 60000
  });
  
  // Wait for page to load
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get page title and basic info
  const pageInfo = await page.evaluate(() => {
    const title = document.title;
    const h1Elements = Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim());
    const svRows = document.querySelectorAll('.svRow').length;
    const svRowItemStats = document.querySelectorAll('.svRow__itemStat').length;
    const svRowGroupHeadings = document.querySelectorAll('.svRowGroupHeading').length;
    
    // Check for error messages
    const bodyText = document.body.textContent || '';
    const hasUnavailableMessage = bodyText.includes('unavailable') || bodyText.includes('Sorry');
    
    // Get a sample of text content
    const sampleText = bodyText.substring(0, 500);
    
    return {
      title,
      h1Elements,
      svRows,
      svRowItemStats,
      svRowGroupHeadings,
      hasUnavailableMessage,
      sampleText,
      url: window.location.href
    };
  });
  
  console.log('\n📊 Page Analysis:');
  console.log(`Title: ${pageInfo.title}`);
  console.log(`H1 elements: ${pageInfo.h1Elements.join(', ')}`);
  console.log(`URL: ${pageInfo.url}`);
  console.log(`\n🎯 Selector Results:`);
  console.log(`- .svRow elements: ${pageInfo.svRows}`);
  console.log(`- .svRow__itemStat elements: ${pageInfo.svRowItemStats}`);
  console.log(`- .svRowGroupHeading elements: ${pageInfo.svRowGroupHeadings}`);
  console.log(`\n❗ Error Detection:`);
  console.log(`- Has "unavailable" message: ${pageInfo.hasUnavailableMessage}`);
  console.log(`\n📝 Sample text content:`);
  console.log(pageInfo.sampleText);
  
  console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  await browser.close();
  console.log('✅ Debug complete');
}

debugHL().catch(console.error);