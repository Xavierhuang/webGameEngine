import * as cheerio from 'cheerio';

interface Event {
  title: string;
  date: string;
  time: string;
  venue: string;
  description: string;
  url: string;
  price?: string;
  tags?: string[];
}

async function scrapeGarysGuide(): Promise<Event[]> {
  const url = 'https://www.garysguide.com/events?region=nyc';
  
  try {
    console.log('Fetching Gary\'s Guide events page...');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const events: Event[] = [];

    // Gary's Guide structure: events are in various sections
    // Look for event links and their metadata
    $('a[href*="/events/"]').each((i, elem) => {
      const $link = $(elem);
      const href = $link.attr('href');
      if (!href || href.includes('Add-New-Event')) return;

      const fullUrl = href.startsWith('http') ? href : `https://www.garysguide.com${href}`;
      
      // Try to extract event info from the link and surrounding elements
      const title = $link.text().trim();
      if (!title || title.length < 5) return; // Skip very short titles

      // Look for date/time in nearby elements
      const $parent = $link.parent();
      const $container = $link.closest('div, li, article');
      
      let date = '';
      let time = '';
      let venue = '';
      let description = '';
      let price = '';

      // Try to find date/time patterns
      $container.find('*').each((_, el) => {
        const text = $(el).text().trim();
        // Look for date patterns like "Nov 17", "Monday, Nov 17"
        if (text.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)day?/i) || text.match(/Nov \d+|Dec \d+/)) {
          if (!date) date = text;
        }
        // Look for time patterns like "7:00am", "5:30pm"
        if (text.match(/\d{1,2}:\d{2}(am|pm)/i)) {
          if (!time) time = text;
        }
        // Look for price patterns
        if (text.match(/^\$[\d,]+|Free/i)) {
          if (!price) price = text;
        }
      });

      // Try to find venue
      const venueText = $container.find('*').filter((_, el) => {
        const text = $(el).text().trim();
        return text.includes('Venue') || text.includes('St') || text.includes('Ave') || text.includes('Blvd');
      }).first().text().trim();
      if (venueText) venue = venueText.replace(/^Venue[:\s]*/i, '');

      // Get description from nearby text
      const descText = $container.text().trim();
      if (descText.length > title.length) {
        description = descText.substring(title.length).split('\n')[0].trim().substring(0, 200);
      }

      if (title) {
        events.push({
          title,
          date: date || 'TBA',
          time: time || 'TBA',
          venue: venue || 'TBA',
          description: description || '',
          url: fullUrl,
          price: price || undefined,
        });
      }
    });

    // Also try to parse structured event listings
    $('div, article, li').each((i, elem) => {
      const $el = $(elem);
      const text = $el.text();
      
      // Look for event date headers like "Nov 17", "Tuesday, Nov 18"
      if (text.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)day?,\s*(Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct)\s+\d+/i)) {
        const dateMatch = text.match(/((Mon|Tue|Wed|Thu|Fri|Sat|Sun)day?,\s*)?(Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct)\s+\d+/i);
        if (dateMatch) {
          const eventDate = dateMatch[0];
          // Find events under this date
          $el.nextAll('div, article, li').each((_, eventEl) => {
            const $event = $(eventEl);
            const eventText = $event.text();
            const link = $event.find('a[href*="/events/"]').first();
            
            if (link.length > 0) {
              const eventTitle = link.text().trim();
              const eventUrl = link.attr('href');
              if (eventTitle && eventUrl && !events.find(e => e.url.includes(eventUrl.split('/').pop() || ''))) {
                const timeMatch = eventText.match(/(\d{1,2}:\d{2}(am|pm))/i);
                const priceMatch = eventText.match(/(\$[\d,]+|Free)/i);
                
                events.push({
                  title: eventTitle,
                  date: eventDate,
                  time: timeMatch ? timeMatch[0] : 'TBA',
                  venue: 'TBA',
                  description: eventText.substring(eventTitle.length).trim().substring(0, 200),
                  url: eventUrl.startsWith('http') ? eventUrl : `https://www.garysguide.com${eventUrl}`,
                  price: priceMatch ? priceMatch[0] : undefined,
                });
              }
            }
          });
        }
      }
    });

    // Remove duplicates based on URL
    const uniqueEvents = Array.from(
      new Map(events.map(e => [e.url, e])).values()
    );

    console.log(`\nScraped ${uniqueEvents.length} events from Gary's Guide\n`);
    return uniqueEvents;
  } catch (error) {
    console.error('Error scraping Gary\'s Guide:', error);
    throw error;
  }
}

// Run the scraper
scrapeGarysGuide()
  .then((events) => {
    console.log(JSON.stringify(events, null, 2));
    console.log(`\nTotal events found: ${events.length}`);
  })
  .catch((error) => {
    console.error('Scraping failed:', error);
    process.exit(1);
  });















