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

  async addTicker(ticker: string, callback: (price: string) => void): Promise<{ success: boolean; error?: string }> {
    const upperTicker = ticker.toUpperCase();
    console.log(`Adding ticker: ${upperTicker}`);

    if (!this.listeners.has(upperTicker)) {
      this.listeners.set(upperTicker, new Set());
      try {
        const isValid = await this.startScrapingTicker(upperTicker);
        if (!isValid) {
          this.listeners.delete(upperTicker);
          return { success: false, error: `${upperTicker} is not a valid ticker or price data is not available` };
        }
      } catch (error) {
        this.listeners.delete(upperTicker);
        console.error(`Error starting scraper for ${upperTicker}:`, error);
        return { success: false, error: `Failed to verify ticker ${upperTicker}` };
      }
    }

    const callbacks = this.listeners.get(upperTicker)!;
    callbacks.add(callback);

    const currentPrice = this.prices.get(upperTicker);
    if (currentPrice) {
      callback(currentPrice);
    }

    return { success: true };
  }

  getPrice(ticker: string): string | undefined {
    return this.prices.get(ticker.toUpperCase());
  }

  async removeTicker(ticker: string, callback: (price: string) => void) {
    const upperTicker = ticker.toUpperCase();
    console.log(`Removing ticker: ${upperTicker}`);

    const callbacks = this.listeners.get(upperTicker);
    if (callbacks) {
      callbacks.delete(callback);

      if (callbacks.size === 0) {
        this.listeners.delete(upperTicker);
        await this.stopScrapingTicker(upperTicker);
      }
    }
  }

  private async startScrapingTicker(ticker: string): Promise<boolean> {
    if (!this.context) {
      throw new Error('Browser not initialized');
    }

    console.log(`Starting to scrape ${ticker}`);
    const page = await this.context.newPage();
    this.pages.set(ticker, page);

    const url = `https://www.tradingview.com/symbols/${ticker}/?exchange=BINANCE`;
    console.log(`Navigating to ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`Page loaded for ${ticker}`);

      // Wait for the page to fully load
      await page.waitForTimeout(3000);

      // Check if we can find a price - this validates if the ticker exists
      const initialPrice = await this.extractPrice(page, ticker);

      if (!initialPrice) {
        console.log(`No price found for ${ticker}, invalid ticker`);
        await page.close();
        this.pages.delete(ticker);
        return false;
      }

      console.log(`Initial price for ${ticker}: ${initialPrice}`);
      this.prices.set(ticker, initialPrice);

      // Start the interval for continuous price updates
      const intervalId = setInterval(async () => {
        try {
          const price = await this.extractPrice(page, ticker);
          if (price && price !== this.prices.get(ticker)) {
            console.log(`Price update for ${ticker}: ${price}`);
            this.prices.set(ticker, price);
            this.notifyListeners(ticker, price);
          }
        } catch (error) {
          console.error(`Error extracting price for ${ticker}:`, error);
        }
      }, 500);

      this.intervalIds.set(ticker, intervalId);
      return true;

    } catch (error) {
      console.error(`Error loading page for ${ticker}:`, error);
      await page.close();
      this.pages.delete(ticker);
      return false;
    }
  }

  private async extractPrice(page: Page, ticker: string): Promise<string | null> {
    try {
      // Use a simpler approach to extract the price
      const price = await page.evaluate(() => {
        const priceElement = document.querySelector('span.js-symbol-last');
        if (!priceElement) return null;

        const text = priceElement.textContent || '';
        return text.trim().replace(/,/g, '') || null;
      });

      if (price && /^\d+(\.\d+)?$/.test(price)) {
        console.log(`Extracted price for ${ticker}: ${price}`);
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
        console.log(`Extracted price using fallback for ${ticker}: ${fallbackPrice}`);
        return fallbackPrice;
      }

      return null;
    } catch (error) {
      console.error(`Error extracting price for ${ticker}:`, error);
      return null;
    }
  }

  private async stopScrapingTicker(ticker: string) {
    console.log(`Stopping scraping for ${ticker}`);

    const intervalId = this.intervalIds.get(ticker);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervalIds.delete(ticker);
    }

    const page = this.pages.get(ticker);
    if (page) {
      await page.close();
      this.pages.delete(ticker);
    }

    this.prices.delete(ticker);
  }

  private notifyListeners(ticker: string, price: string) {
    const callbacks = this.listeners.get(ticker);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(price);
        } catch (error) {
          console.error(`Error in price callback for ${ticker}:`, error);
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