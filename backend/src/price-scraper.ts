import { chromium, Browser, Page, BrowserContext } from 'playwright';

interface PriceListener {
  ticker: string;
  callback: (price: string) => void;
}

export class PriceScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private listeners: Map<string, Set<(price: string) => void>> = new Map();
  private prices: Map<string, string> = new Map();
  private intervalIds: Map<string, NodeJS.Timeout> = new Map();

  async initialize() {
    console.log('Initializing browser...');
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ]
    });
    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    console.log('Browser initialized successfully');
  }

  async addTicker(ticker: string, exchange: string, callback: (price: string) => void): Promise<{ success: boolean; error?: string }> {
    const upperTicker = ticker.toUpperCase();
    const upperExchange = exchange.toUpperCase();
    const key = `${upperExchange}:${upperTicker}`;
    console.log(`Adding ticker: ${key}`);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
      try {
        const isValid = await this.startScrapingTicker(upperTicker, upperExchange);
        if (!isValid) {
          this.listeners.delete(key);
          return { success: false, error: `${upperTicker} is not a valid ticker or price data is not available` };
        }
      } catch (error) {
        this.listeners.delete(key);
        console.error(`Error starting scraper for ${key}:`, error);
        return { success: false, error: `Failed to verify ticker ${upperTicker}` };
      }
    }

    const callbacks = this.listeners.get(key)!;
    callbacks.add(callback);

    const currentPrice = this.prices.get(key);
    if (currentPrice) {
      callback(currentPrice);
    }

    return { success: true };
  }

  getPrice(key: string): string | undefined {
    return this.prices.get(key);
  }

  async removeTicker(ticker: string, exchange: string, callback: (price: string) => void) {
    const upperTicker = ticker.toUpperCase();
    const upperExchange = exchange.toUpperCase();
    const key = `${upperExchange}:${upperTicker}`;
    console.log(`Removing ticker: ${key}`);

    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);

      if (callbacks.size === 0) {
        this.listeners.delete(key);
        await this.stopScrapingTicker(key);
      }
    }
  }

  private async startScrapingTicker(ticker: string, exchange: string): Promise<boolean> {
    if (!this.context) {
      throw new Error('Browser not initialized');
    }

    const key = `${exchange}:${ticker}`;
    console.log(`Starting to scrape ${key}`);
    const page = await this.context.newPage();
    this.pages.set(key, page);

    const url = `https://www.tradingview.com/symbols/${ticker}/?exchange=${exchange}`;
    console.log(`Navigating to ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`Page loaded for ${key}`);

      // Wait for the page to fully load
      await page.waitForTimeout(3000);

      // Check if we can find a price - this validates if the ticker exists
      const initialPrice = await this.extractPrice(page, key);

      if (!initialPrice) {
        console.log(`No price found for ${key}, invalid ticker`);
        await page.close();
        this.pages.delete(key);
        return false;
      }

      console.log(`Initial price for ${key}: ${initialPrice}`);
      this.prices.set(key, initialPrice);

      // Start the interval for continuous price updates
      const intervalId = setInterval(async () => {
        try {
          const price = await this.extractPrice(page, key);
          if (price && price !== this.prices.get(key)) {
            console.log(`Price update for ${key}: ${price}`);
            this.prices.set(key, price);
            this.notifyListeners(key, price);
          }
        } catch (error) {
          console.error(`Error extracting price for ${key}:`, error);
        }
      }, 500);

      this.intervalIds.set(key, intervalId);
      return true;

    } catch (error) {
      console.error(`Error loading page for ${key}:`, error);
      await page.close();
      this.pages.delete(key);
      return false;
    }
  }

  private async extractPrice(page: Page, key: string): Promise<string | null> {
    try {
      // Use a simpler approach to extract the price
      const price = await page.evaluate(() => {
        const priceElement = document.querySelector('span.js-symbol-last');
        if (!priceElement) return null;

        const text = priceElement.textContent || '';
        return text.trim().replace(/,/g, '') || null;
      });

      if (price && /^\d+(\.\d+)?$/.test(price)) {
        console.log(`Extracted price for ${key}: ${price}`);
        return price;
      }

      // Fallback selectors
      const fallbackPrice = await page.evaluate(() => {
        const selectors = [
          'div.tv-symbol-price-quote__value',
          'span[data-symbol-last]',
          '[class*="priceValue"]'
        ];

        for (let i = 0; i < selectors.length; i++) {
          const element = document.querySelector(selectors[i]);
          if (element) {
            const text = (element.textContent || '').trim().replace(/,/g, '');
            if (text && /^\d+(\.\d+)?$/.test(text)) {
              return text;
            }
          }
        }
        return null;
      });

      if (fallbackPrice) {
        console.log(`Extracted price using fallback for ${key}: ${fallbackPrice}`);
        return fallbackPrice;
      }

      return null;
    } catch (error) {
      console.error(`Error extracting price for ${key}:`, error);
      return null;
    }
  }

  private async stopScrapingTicker(key: string) {
    console.log(`Stopping scraping for ${key}`);

    const intervalId = this.intervalIds.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervalIds.delete(key);
    }

    const page = this.pages.get(key);
    if (page) {
      await page.close();
      this.pages.delete(key);
    }

    this.prices.delete(key);
  }

  private notifyListeners(key: string, price: string) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(price);
        } catch (error) {
          console.error(`Error in price callback for ${key}:`, error);
        }
      });
    }
  }

  async cleanup() {
    console.log('Cleaning up browser resources...');

    for (const intervalId of this.intervalIds.values()) {
      clearInterval(intervalId);
    }
    this.intervalIds.clear();

    for (const page of this.pages.values()) {
      await page.close();
    }
    this.pages.clear();

    if (this.context) {
      await this.context.close();
    }

    if (this.browser) {
      await this.browser.close();
    }

    console.log('Cleanup complete');
  }
}
