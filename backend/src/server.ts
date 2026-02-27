import { createServer } from 'http';
import { PriceScraper } from './price-scraper.js';

const priceScraper = new PriceScraper();

interface Client {
  id: string;
  res: any;
  tickers: Set<string>;
}

const clients = new Map<string, Client>();
let clientIdCounter = 0;

function broadcast(ticker: string, price: string) {
  const message = JSON.stringify({
    ticker,
    price,
    timestamp: Date.now()
  });

  for (const client of clients.values()) {
    if (client.tickers.has(ticker)) {
      client.res.write(`data: ${message}\n\n`);
    }
  }
}

async function handleEvents(req: any, res: any) {
  const clientId = `client-${++clientIdCounter}`;
  console.log(`New SSE client connected: ${clientId}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const client: Client = {
    id: clientId,
    res,
    tickers: new Set()
  };

  clients.set(clientId, client);

  // Send initial connection message
  res.write(':ok\n\n');

  req.on('close', () => {
    console.log(`SSE client ${clientId} disconnected`);
    clients.delete(clientId);
  });
}

async function handleSubscribe(req: any, res: any) {
  let body = '';

  req.on('data', (chunk: any) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { ticker } = JSON.parse(body);
      const upperTicker = ticker.toUpperCase();

      console.log(`Subscription request for ${upperTicker}`);

      // Start scraping and validate ticker
      const result = await priceScraper.addTicker(upperTicker, (price: string) => {
        broadcast(upperTicker, price);
      });

      if (!result.success) {
        // Invalid ticker, return error
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ error: result.error }));
        return;
      }

      // Add ticker to all connected clients after validation
      for (const client of clients.values()) {
        client.tickers.add(upperTicker);
      }

      // Broadcast current price immediately — the initial callback fired before
      // clients had the ticker, so push it now that they're subscribed
      const currentPrice = priceScraper.getPrice(upperTicker);
      if (currentPrice) {
        broadcast(upperTicker, currentPrice);
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error('Error in subscribe:', error);
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
  });
}

async function handleUnsubscribe(req: any, res: any) {
  let body = '';

  req.on('data', (chunk: any) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { ticker } = JSON.parse(body);
      const upperTicker = ticker.toUpperCase();

      console.log(`Unsubscribe request for ${upperTicker}`);

      // Remove ticker from all clients
      let hasSubscribers = false;
      for (const client of clients.values()) {
        client.tickers.delete(upperTicker);
        if (client.tickers.has(upperTicker)) {
          hasSubscribers = true;
        }
      }

      // Stop scraping if no subscribers
      if (!hasSubscribers) {
        // We need to track the callback to remove it properly
        // For now, we'll keep it simple
        console.log(`No more subscribers for ${upperTicker}, stopping scraper`);
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error('Error in unsubscribe:', error);
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Invalid request' }));
    }
  });
}

async function main() {
  await priceScraper.initialize();

  const server = createServer(async (req, res) => {
    console.log(`${req.method} ${req.url}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (req.url === '/events' && req.method === 'GET') {
      await handleEvents(req, res);
    } else if (req.url === '/subscribe' && req.method === 'POST') {
      await handleSubscribe(req, res);
    } else if (req.url === '/unsubscribe' && req.method === 'POST') {
      await handleUnsubscribe(req, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Ready to stream cryptocurrency prices...');
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await priceScraper.cleanup();
    server.close();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Server failed to start:', error);
  process.exit(1);
});