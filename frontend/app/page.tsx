'use client';

import { useState, useEffect, useRef } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

interface PriceData {
  ticker: string;
  price: string;
  timestamp: number;
}

export default function Home() {
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [subscribedTickers, setSubscribedTickers] = useState<Set<string>>(new Set());
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    console.log('Initializing connection to backend...');
    connectToBackend();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const connectToBackend = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('Creating EventSource connection...');
    const eventSource = new EventSource(`${BACKEND_URL}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('Connected to backend');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.ticker && data.price) {
          console.log(`Price update received: ${data.ticker} = ${data.price}`);
          setPrices(prev => {
            const newPrices = new Map(prev);
            newPrices.set(data.ticker, {
              ticker: data.ticker,
              price: data.price,
              timestamp: data.timestamp || Date.now()
            });
            return newPrices;
          });
        }
      } catch (e) {
        console.error('Failed to parse update:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      setConnected(false);
      setTimeout(() => connectToBackend(), 5000);
    };
  };

  const subscribeTicker = async (ticker: string) => {
    const upperTicker = ticker.toUpperCase();

    if (subscribedTickers.has(upperTicker)) {
      console.log(`Already subscribed to ${upperTicker}`);
      setError(`Already subscribed to ${upperTicker}`);
      return;
    }

    console.log(`Subscribing to ${upperTicker}...`);
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${BACKEND_URL}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticker: upperTicker }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to subscribe to ${upperTicker}`);
      }

      setSubscribedTickers(prev => new Set([...prev, upperTicker]));
      console.log(`Successfully subscribed to ${upperTicker}`);
      setSelectedTicker('');
    } catch (error: any) {
      console.error(`Failed to subscribe to ${upperTicker}:`, error);
      setError(error.message || `Failed to subscribe to ${upperTicker}`);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeTicker = async (ticker: string) => {
    console.log(`Unsubscribing from ${ticker}...`);

    try {
      const response = await fetch(`${BACKEND_URL}/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticker }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setSubscribedTickers(prev => {
        const newSet = new Set(prev);
        newSet.delete(ticker);
        return newSet;
      });

      setPrices(prev => {
        const newPrices = new Map(prev);
        newPrices.delete(ticker);
        return newPrices;
      });

      console.log(`Unsubscribed from ${ticker}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from ${ticker}:`, error);
    }
  };

  const handleAddTicker = () => {
    const trimmedTicker = selectedTicker.trim();
    if (!trimmedTicker) {
      setError('Please enter a ticker symbol');
      return;
    }
    subscribeTicker(trimmedTicker);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleAddTicker();
    }
  };

  const sortedTickers = Array.from(subscribedTickers).sort();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16213e 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      color: '#ffffff',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Animated Background */}
      <div style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        zIndex: 0
      }}>
        <div style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(147, 51, 234, 0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          top: '-300px',
          right: '-200px',
          animation: 'float 20s ease-in-out infinite'
        }} />
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
          borderRadius: '50%',
          bottom: '-200px',
          left: '-100px',
          animation: 'float 15s ease-in-out infinite reverse'
        }} />
      </div>

      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '40px 20px',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '50px'
        }}>
          <h1 style={{
            fontSize: '3.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #667eea 75%, #764ba2 100%)',
            backgroundSize: '200% 200%',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gradient 5s ease infinite',
            marginBottom: '10px',
            letterSpacing: '-0.02em'
          }}>Crypto Price Tracker</h1>
          <p style={{
            fontSize: '1.1rem',
            color: '#94a3b8',
            fontWeight: '400'
          }}>Real-time cryptocurrency prices from TradingView</p>
        </div>

        {/* Control Panel */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '30px',
          marginBottom: '30px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: connected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${connected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '50px'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: connected ? '#22c55e' : '#ef4444',
                boxShadow: connected ? '0 0 10px #22c55e' : '0 0 10px #ef4444',
                animation: connected ? 'pulse 2s infinite' : 'none'
              }} />
              <span style={{
                fontSize: '0.9rem',
                fontWeight: '600',
                color: connected ? '#22c55e' : '#ef4444'
              }}>
                {connected ? 'Live' : 'Disconnected'}
              </span>
            </div>

            <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
              <input
                type="text"
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
                onKeyPress={handleKeyPress}
                placeholder="Enter ticker (e.g., BTCUSD)"
                disabled={loading || !connected}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  fontSize: '1rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '2px solid rgba(147, 51, 234, 0.3)',
                  borderRadius: '12px',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  transition: 'all 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(147, 51, 234, 0.6)';
                  e.target.style.boxShadow = '0 0 20px rgba(147, 51, 234, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(147, 51, 234, 0.3)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              onClick={handleAddTicker}
              disabled={!selectedTicker || !connected || loading}
              style={{
                padding: '14px 32px',
                fontSize: '1rem',
                fontWeight: '700',
                background: !selectedTicker || !connected || loading
                  ? 'rgba(100, 100, 100, 0.2)'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                cursor: !selectedTicker || !connected || loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                transform: 'translateY(0)',
                boxShadow: !selectedTicker || !connected || loading
                  ? 'none'
                  : '0 4px 15px rgba(102, 126, 234, 0.4)'
              }}
              onMouseEnter={(e) => {
                if (!(!selectedTicker || !connected || loading)) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = !selectedTicker || !connected || loading
                  ? 'none'
                  : '0 4px 15px rgba(102, 126, 234, 0.4)';
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Adding...
                </span>
              ) : 'Add Ticker'}
            </button>
          </div>
          {error && (
            <div style={{
              marginTop: '15px',
              padding: '12px 20px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              color: '#ff6b6b',
              fontSize: '0.95rem',
              fontWeight: '500',
              animation: 'slideIn 0.3s ease'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Ticker Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px'
        }}>
          {sortedTickers.map(ticker => {
            const priceData = prices.get(ticker);
            return (
              <div
                key={ticker}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  transition: 'all 0.3s ease',
                  animation: 'fadeIn 0.5s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(147, 51, 234, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(147, 51, 234, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                {/* Gradient overlay */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '16px 16px 0 0'
                }} />

                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px'
                  }}>
                    <span style={{
                      fontSize: '1.2rem',
                      fontWeight: '700',
                      color: '#ffffff',
                      letterSpacing: '0.5px'
                    }}>{ticker}</span>
                    <button
                      onClick={() => unsubscribeTicker(ticker)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: '#ff6b6b',
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {priceData ? (
                    <>
                      <div style={{
                        fontSize: '2.2rem',
                        fontWeight: '800',
                        color: '#ffffff',
                        marginBottom: '8px',
                        fontFamily: '"SF Mono", Monaco, "Cascadia Code", monospace'
                      }}>
                        ${priceData.price}
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.9rem',
                        color: '#64748b'
                      }}>
                        <div style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#22c55e',
                          animation: 'pulse 2s infinite'
                        }} />
                        <span>Updated {new Date(priceData.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '20px 0',
                      color: '#64748b'
                    }}>
                      <div style={{
                        width: '20px',
                        height: '20px',
                        border: '2px solid rgba(147, 51, 234, 0.3)',
                        borderTopColor: '#9333ea',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      <span>Fetching price...</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {sortedTickers.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#64748b'
          }}>
            <div style={{
              fontSize: '3rem',
              marginBottom: '20px',
              opacity: 0.5
            }}>📊</div>
            <p style={{
              fontSize: '1.1rem',
              fontWeight: '500',
              marginBottom: '10px'
            }}>No tickers added yet</p>
            <p style={{
              fontSize: '0.95rem',
              color: '#475569'
            }}>Enter a ticker symbol above to start tracking prices</p>
          </div>
        )}

        {/* CSS Animations */}
        <style jsx>{`
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            33% { transform: translateY(-20px) rotate(1deg); }
            66% { transform: translateY(20px) rotate(-1deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideIn {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
          }
          input::placeholder {
            color: rgba(148, 163, 184, 0.6);
          }
          input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
}