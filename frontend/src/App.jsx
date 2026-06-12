import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, 
  Activity, 
  Users, 
  Network, 
  AlertOctagon, 
  User, 
  Search, 
  Filter, 
  X, 
  ChevronRight, 
  TrendingUp, 
  Cpu, 
  RefreshCw, 
  Play, 
  Square,
  Award,
  Database
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  Cell 
} from 'recharts';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  
  // Accounts table state
  const [accounts, setAccounts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    riskLevel: 'all',
    occupation: 'all',
    accountType: 'all',
    search: ''
  });
  
  // Drawer state
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [accountDetail, setAccountDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Network graph state
  const [networkData, setNetworkData] = useState({ nodes: [], edges: [] });
  const [networkLoading, setNetworkLoading] = useState(false);

  // WebSocket Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const wsRef = useRef(null);

  // Fetch Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Error fetching stats:", e);
    }
  };

  // Fetch Accounts
  const fetchAccounts = async () => {
    try {
      const { riskLevel, occupation, accountType, search } = filters;
      const queryParams = new URLSearchParams({
        page,
        limit: 10,
        risk_level: riskLevel,
        occupation,
        account_type: accountType,
        search
      });
      const res = await fetch(`http://localhost:8000/api/accounts?${queryParams}`);
      const data = await res.json();
      setAccounts(data.items);
      setTotalCount(data.total);
      setTotalPages(Math.ceil(data.total / data.limit));
    } catch (e) {
      console.error("Error fetching accounts:", e);
    }
  };

  // Fetch Account Detail
  const fetchAccountDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/accounts/${id}`);
      const data = await res.json();
      setAccountDetail(data);
    } catch (e) {
      console.error("Error fetching account detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  // Fetch Network Data
  const fetchNetworkData = async () => {
    setNetworkLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/network');
      const data = await res.json();
      setNetworkData(data);
    } catch (e) {
      console.error("Error fetching network data:", e);
    } finally {
      setNetworkLoading(false);
    }
  };

  // Initialize data on load
  useEffect(() => {
    fetchStats();
    fetchAccounts();
    fetchNetworkData();
  }, []);

  // Refetch accounts when page or filters change
  useEffect(() => {
    fetchAccounts();
  }, [page, filters]);

  // Load detail when account ID selected
  useEffect(() => {
    if (selectedAccountId) {
      fetchAccountDetail(selectedAccountId);
    }
  }, [selectedAccountId]);

  // Handle Simulation (WebSocket)
  useEffect(() => {
    if (isSimulating) {
      // Connect to WS
      const ws = new WebSocket('ws://localhost:8000/ws/simulate');
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected.");
        ws.send("START");
      };

      ws.onmessage = (event) => {
        try {
          const alert = JSON.parse(event.data);
          setAlerts(prev => [alert, ...prev].slice(0, 30)); // Keep last 30 alerts
          
          // Proactively refresh stats if new high risk is flagged
          if (alert.alert_triggered) {
            fetchStats();
            fetchAccounts();
          }
        } catch (e) {
          console.error("WS parse error:", e);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected.");
      };

      return () => {
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    } else {
      if (wsRef.current) {
        wsRef.current.close();
      }
    }
  }, [isSimulating]);

  // Custom Interactive Force-Directed Physics Graph (React implementation)
  const ForceGraph = ({ data }) => {
    const canvasWidth = 650;
    const canvasHeight = 440;
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const dragNodeRef = useRef(null);
    const containerRef = useRef(null);

    // Initialize node positions
    useEffect(() => {
      if (!data.nodes || data.nodes.length === 0) return;
      
      const initializedNodes = data.nodes.map((n, i) => {
        // Spread nodes out in a circle initially
        const angle = (i / data.nodes.length) * 2 * Math.PI;
        const radius = 150 + Math.random() * 50;
        return {
          ...n,
          x: canvasWidth / 2 + Math.cos(angle) * radius,
          y: canvasHeight / 2 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0
        };
      });

      setNodes(initializedNodes);
      setEdges(data.edges);
    }, [data]);

    // Force simulation loop using requestAnimationFrame
    useEffect(() => {
      if (nodes.length === 0) return;

      let animId;
      const tick = () => {
        // Physics constants
        const kRepulsion = 800; // Repulsion constant
        const kAttraction = 0.04; // Spring constant
        const d0 = 90; // Natural link distance
        const kGravity = 0.015; // Center gravity strength
        const damping = 0.85; // Friction

        const newNodes = nodes.map(n => ({ ...n }));
        const nodeMap = {};
        newNodes.forEach(n => { nodeMap[n.id] = n; });

        // 1. Repulsion between all node pairs
        for (let i = 0; i < newNodes.length; i++) {
          const n1 = newNodes[i];
          for (let j = i + 1; j < newNodes.length; j++) {
            const n2 = newNodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
            
            if (dist < 250) {
              const force = kRepulsion / (dist * dist);
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              
              n1.vx -= fx;
              n1.vy -= fy;
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }

        // 2. Attraction along edges
        edges.forEach(edge => {
          const sourceNode = nodeMap[edge.source];
          const targetNode = nodeMap[edge.target];
          
          if (sourceNode && targetNode) {
            const dx = targetNode.x - sourceNode.x;
            const dy = targetNode.y - sourceNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
            
            const force = kAttraction * (dist - d0);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            sourceNode.vx += fx;
            sourceNode.vy += fy;
            targetNode.vx -= fx;
            targetNode.vy -= fy;
          }
        });

        // 3. Gravity pulling to center & Update positions
        newNodes.forEach(n => {
          if (dragNodeRef.current && dragNodeRef.current.id === n.id) {
            // Locking dragged node to mouse
            return;
          }
          const dx = canvasWidth / 2 - n.x;
          const dy = canvasHeight / 2 - n.y;
          
          n.vx += dx * kGravity;
          n.vy += dy * kGravity;
          
          // Apply velocity and damping
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= damping;
          n.vy *= damping;
          
          // Bounce off walls
          const padding = 20;
          if (n.x < padding) { n.x = padding; n.vx = -n.vx * 0.5; }
          if (n.x > canvasWidth - padding) { n.x = canvasWidth - padding; n.vx = -n.vx * 0.5; }
          if (n.y < padding) { n.y = padding; n.vy = -n.vy * 0.5; }
          if (n.y > canvasHeight - padding) { n.y = canvasHeight - padding; n.vy = -n.vy * 0.5; }
        });

        // Only update state if position shifted significantly to avoid infinite react cycles
        setNodes(newNodes);
        animId = requestAnimationFrame(tick);
      };

      animId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animId);
    }, [nodes, edges]);

    const handleMouseDown = (node, e) => {
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      dragNodeRef.current = {
        id: node.id,
        offsetX: e.clientX - rect.left - node.x,
        offsetY: e.clientY - rect.top - node.y
      };
      
      // Hook up window listeners so dragging is smooth outside node bounds
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
      if (!dragNodeRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      setNodes(prev => prev.map(n => {
        if (n.id === dragNodeRef.current.id) {
          return {
            ...n,
            x: Math.max(10, Math.min(canvasWidth - 10, mouseX)),
            y: Math.max(10, Math.min(canvasHeight - 10, mouseY)),
            vx: 0,
            vy: 0
          };
        }
        return n;
      }));
    };

    const handleMouseUp = () => {
      dragNodeRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    const getNodeColor = (node) => {
      if (node.type === 'hub') return '#ff9100';
      if (node.type === 'ip') return '#9b51e0';
      if (node.type === 'device') return '#29b6f6';
      
      // For accounts, color by risk score
      if (node.status === 'flagged') return '#ff4b5c';
      return '#00e676';
    };

    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    return (
      <svg 
        ref={containerRef} 
        className="network-graph-canvas"
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        style={{ userSelect: 'none' }}
      >
        {/* Draw edges/links */}
        {edges.map((edge, idx) => {
          const s = nodeMap[edge.source];
          const t = nodeMap[edge.target];
          if (!s || !t) return null;
          return (
            <line
              key={`edge-${idx}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={edge.type === 'flagged_transfer' ? 'rgba(255, 75, 92, 0.4)' : 'rgba(255, 255, 255, 0.12)'}
              strokeWidth={edge.type === 'flagged_transfer' ? 2 : 1.2}
              strokeDasharray={edge.type === 'layering' ? '4,4' : 'none'}
            />
          );
        })}

        {/* Draw node circles */}
        {nodes.map((node) => {
          const color = getNodeColor(node);
          const isFlagged = node.status === 'flagged';
          return (
            <g 
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseDown={(e) => handleMouseDown(node, e)}
              onClick={() => {
                if (node.type === 'account') {
                  const rawId = parseInt(node.id.replace('Acc_', ''));
                  setSelectedAccountId(rawId);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              {isFlagged && (
                <circle
                  r={18}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.6}
                  style={{ animation: 'blink 1.5s infinite' }}
                />
              )}
              <circle
                r={node.type === 'hub' ? 14 : 9}
                fill={color}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={1.5}
                filter={isFlagged ? 'drop-shadow(0px 0px 6px #ff4b5c)' : 'none'}
              />
              <text
                y={node.type === 'hub' ? 24 : 18}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize={9}
                fontWeight={node.type === 'hub' ? 'bold' : 'normal'}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  // Sample data for overview dashboard charts
  const riskTimelineData = [
    { name: '08:00', riskIndex: 12 },
    { name: '10:00', riskIndex: 18 },
    { name: '12:00', riskIndex: 35 },
    { name: '14:00', riskIndex: 42 },
    { name: '16:00', riskIndex: 29 },
    { name: '18:00', riskIndex: 56 },
    { name: '20:00', riskIndex: 48 },
  ];

  const occupationMuleData = [
    { name: 'Student', rate: 45 },
    { name: 'Housewife', rate: 25 },
    { name: 'Self-Employed', rate: 15 },
    { name: 'Salaried', rate: 8 },
    { name: 'Agriculture', rate: 5 },
    { name: 'Others', rate: 2 },
  ];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-section">
          <ShieldAlert size={28} className="icon-cyan" style={{ filter: 'drop-shadow(0 0 8px var(--accent-cyan))' }} />
          <h1 className="logo-text">ANTIGRAVITY MULE</h1>
        </div>

        <nav>
          <ul className="nav-links">
            <li>
              <div 
                className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                <Activity size={18} />
                Overview Control
              </div>
            </li>
            <li>
              <div 
                className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
                onClick={() => setActiveTab('accounts')}
              >
                <Users size={18} />
                Mule Registry
              </div>
            </li>
            <li>
              <div 
                className={`nav-item ${activeTab === 'network' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('network');
                  fetchNetworkData();
                }}
              >
                <Network size={18} />
                Graph Network
              </div>
            </li>
          </ul>
        </nav>

        {/* Engine status indicator */}
        <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <Database size={14} className="icon-cyan" />
            <span>Dataset Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>Random Forest (9k accounts)</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Header */}
        <header className="header-row">
          <div>
            <h2 className="page-title">
              {activeTab === 'dashboard' && 'Risk Operations Center'}
              {activeTab === 'accounts' && 'Mule Account Registry'}
              {activeTab === 'network' && 'Graph Network Intelligence'}
            </h2>
            <p className="page-subtitle">Real-time ML Classifier & Laundering Ring Visualizer</p>
          </div>

          {/* Simulator Control Trigger */}
          <div className="simulator-control-panel">
            <Cpu size={16} className={isSimulating ? "icon-pink" : "icon-cyan"} />
            <span className="switch-label">Live Transaction Simulator</span>
            <button 
              className={`switch-btn ${isSimulating ? 'active' : ''}`}
              onClick={() => setIsSimulating(!isSimulating)}
            >
              <div className="switch-circle"></div>
            </button>
          </div>
        </header>

        {/* STATS OVERVIEW CARDS */}
        {stats && (
          <section className="stats-grid">
            <div className="glass-panel stat-card">
              <div className="stat-info">
                <h3>Total Scanned Profiles</h3>
                <div className="stat-value">{stats.total_accounts}</div>
              </div>
              <div className="stat-icon icon-cyan">
                <Database size={24} />
              </div>
            </div>

            <div className="glass-panel stat-card">
              <div className="stat-info">
                <h3>Flagged Mules (Score ≥ 0.5)</h3>
                <div className="stat-value" style={{ color: 'var(--accent-pink)' }}>{stats.flagged_accounts}</div>
              </div>
              <div className="stat-icon icon-pink">
                <AlertOctagon size={24} />
              </div>
            </div>

            <div className="glass-panel stat-card">
              <div className="stat-info">
                <h3>Medium Risk Anomalies</h3>
                <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>{stats.medium_risk_accounts}</div>
              </div>
              <div className="stat-icon icon-purple">
                <ShieldAlert size={24} />
              </div>
            </div>

            <div className="glass-panel stat-card">
              <div className="stat-info">
                <h3>Vulnerability Score (Avg)</h3>
                <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{stats.mule_ratio}%</div>
              </div>
              <div className="stat-icon icon-green">
                <TrendingUp size={24} />
              </div>
            </div>
          </section>
        )}

        {/* TAB 1: OVERVIEW DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-split">
            {/* Charts & Analytics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div className="glass-panel table-card">
                <div className="card-header">
                  <h3 className="card-title">Real-time Risk Ingestion Index</h3>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={riskTimelineData}>
                      <defs>
                        <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent-cyan)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--accent-cyan)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} />
                      <Tooltip 
                        contentStyle={{ background: '#080d19', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                      />
                      <Area type="monotone" dataKey="riskIndex" stroke="var(--accent-cyan)" strokeWidth={2} fillOpacity={1} fill="url(#colorRisk)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Occupation Vuln chart */}
              <div className="glass-panel table-card">
                <div className="card-header">
                  <h3 className="card-title">Demographic Category Vulnerability Index</h3>
                </div>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={occupationMuleData}>
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} />
                      <YAxis stroke="var(--text-muted)" fontSize={11} />
                      <Tooltip 
                        contentStyle={{ background: '#080d19', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      />
                      <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                        {occupationMuleData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={index === 0 ? 'var(--accent-pink)' : index === 1 ? 'var(--accent-purple)' : 'var(--accent-cyan)'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Live alerts column */}
            <div className="glass-panel alert-feed-card">
              <div className="feed-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Live Ops Ingestion Feed
                  {isSimulating && <span className="blinking-dot"></span>}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {isSimulating ? 'Simulating transactions...' : 'Simulator idle.'}
                </span>
              </div>
              
              <div className="alert-list">
                {alerts.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No active transactions in buffer. Toggle the "Live Transaction Simulator" above to feed mock streams.
                  </div>
                ) : (
                  alerts.map((alert, index) => (
                    <div 
                      key={`alert-${index}`}
                      className={`alert-item ${alert.alert_triggered ? 'alert-critical' : ''}`}
                      onClick={() => setSelectedAccountId(alert.account_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="alert-item-header">
                        <span className="alert-acct">Account #{alert.account_id}</span>
                        <span>{alert.timestamp.split(' ')[1]}</span>
                      </div>
                      <p className="alert-desc">{alert.reason}</p>
                      <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                        <span className="badge badge-low" style={{ background: 'none', border: 'none', padding: 0 }}>
                          Amount: ${alert.transaction_amount.toLocaleString()}
                        </span>
                        <span className={alert.alert_triggered ? 'badge badge-high' : 'badge badge-low'}>
                          {alert.alert_triggered ? 'CRITICAL RISK' : 'APPROVED'}
                        </span>
                      </div>
                      <div className="alert-risk-bar">
                        <div 
                          className="alert-risk-fill" 
                          style={{ 
                            width: `${alert.risk_score * 100}%`,
                            backgroundColor: alert.alert_triggered ? 'var(--accent-pink)' : 'var(--accent-cyan)'
                          }}
                        ></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MULE REGISTRY (ACCOUNTS TABLE) */}
        {activeTab === 'accounts' && (
          <div className="glass-panel table-card">
            <div className="card-header">
              <h3 className="card-title">Mule Account Registry Database</h3>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Viewing {accounts.length} of {totalCount} matching profiles
              </div>
            </div>

            {/* Filter controls */}
            <div className="search-filter-row">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search Account ID..."
                  style={{ paddingLeft: '36px', width: '220px' }}
                  value={filters.search}
                  onChange={(e) => {
                    setFilters(prev => ({ ...prev, search: e.target.value }));
                    setPage(1);
                  }}
                />
              </div>

              <select 
                className="select-input"
                value={filters.riskLevel}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, riskLevel: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="all">Risk: All Profiles</option>
                <option value="high">High Risk (≥ 0.5)</option>
                <option value="medium">Medium Risk (0.15 - 0.5)</option>
                <option value="low">Low Risk (&lt; 0.15)</option>
              </select>

              <select 
                className="select-input"
                value={filters.occupation}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, occupation: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="all">Occupation: All</option>
                <option value="student">Student</option>
                <option value="housewife">Housewife</option>
                <option value="selfemployed">Self Employed</option>
                <option value="salaried">Salaried</option>
                <option value="agriculture">Agriculture</option>
                <option value="retired">Retired</option>
              </select>

              <select 
                className="select-input"
                value={filters.accountType}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, accountType: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="all">Account Type: All</option>
                <option value="savings">Savings</option>
                <option value="current">Current</option>
                <option value="msme micro">MSME Micro</option>
                <option value="staff loans">Staff Loans</option>
              </select>
            </div>

            {/* Table */}
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Account ID</th>
                    <th>Vulnerability Score</th>
                    <th>Risk Class</th>
                    <th>Demographics</th>
                    <th>Product Type</th>
                    <th>Customer Segment</th>
                    <th>Geographic Zone</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acct) => {
                    const isFlagged = acct.risk_score >= 0.5;
                    return (
                      <tr 
                        key={acct.id} 
                        className={isFlagged ? 'row-flagged' : ''}
                        onClick={() => setSelectedAccountId(acct.id)}
                      >
                        <td style={{ fontWeight: 'bold' }}>#{acct.id}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '600', width: '40px' }}>{(acct.risk_score * 100).toFixed(1)}%</span>
                            <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div 
                                style={{ 
                                  height: '100%', 
                                  width: `${acct.risk_score * 100}%`,
                                  background: isFlagged ? 'var(--accent-pink)' : acct.risk_score >= 0.15 ? 'var(--accent-purple)' : 'var(--accent-cyan)'
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={isFlagged ? 'badge badge-high' : acct.risk_score >= 0.15 ? 'badge badge-medium' : 'badge badge-low'}>
                            {isFlagged ? 'CRITICAL' : acct.risk_score >= 0.15 ? 'SUSPICIOUS' : 'NORMAL'}
                          </span>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{acct.occupation} ({acct.gender})</td>
                        <td>{acct.account_type}</td>
                        <td>{acct.segment}</td>
                        <td>{acct.geographic_zone === 'M' ? 'Metro' : acct.geographic_zone === 'U' ? 'Urban' : acct.geographic_zone === 'SU' ? 'Semi-Urban' : 'Rural'}</td>
                        <td>
                          <ChevronRight size={16} className="text-muted" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-row">
              <button 
                className="pagination-btn"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous Page
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <button 
                className="pagination-btn"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next Page
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: NETWORK GRAPH */}
        {activeTab === 'network' && (
          <div className="glass-panel network-card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Dynamic Laundering Network Graphs</h3>
                <p className="page-subtitle" style={{ margin: 0 }}>Showing topological clusters of money laundering rings, shared devices, and suspect Cash-Out Gateways.</p>
              </div>
              <button 
                className="pagination-btn" 
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={fetchNetworkData}
                disabled={networkLoading}
              >
                <RefreshCw size={14} className={networkLoading ? 'animate-spin' : ''} />
                Regenerate Graph
              </button>
            </div>

            <div className="network-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#ff4b5c' }}></div>
                <span>Flagged Mule Account</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#00e676' }}></div>
                <span>Normal Account</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#ff9100' }}></div>
                <span>Common Cash-Out Hub</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#9b51e0' }}></div>
                <span>VPN/IP Gateway</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#29b6f6' }}></div>
                <span>Common Device ID</span>
              </div>
            </div>

            {networkLoading ? (
              <div style={{ height: '440px', display: 'flex', alignItems: 'center', justify: 'center', color: 'var(--text-muted)' }}>
                Computing topology links...
              </div>
            ) : (
              <ForceGraph data={networkData} />
            )}
          </div>
        )}
      </main>

      {/* DETAIL DRAWER / OVERLAY PANEL */}
      {selectedAccountId && (
        <div className="modal-overlay" onClick={() => setSelectedAccountId(null)}>
          <div className="modal-drawer" onClick={(e) => e.stopPropagation()}>
            
            {/* Drawer Header */}
            <div className="modal-header">
              <div>
                <h3 className="page-title" style={{ fontSize: '22px' }}>Profile Inspector</h3>
                <p className="page-subtitle" style={{ margin: 0 }}>Account Registry Deep-Dive</p>
              </div>
              <button className="close-btn" onClick={() => setSelectedAccountId(null)}>
                <X size={24} />
              </button>
            </div>

            {detailLoading || !accountDetail ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Ingesting feature profiles...
              </div>
            ) : (
              <>
                {/* Account Details Box */}
                <div className="profile-card-summary">
                  <div>
                    <div className="profile-field-label">Account Identification</div>
                    <div className="profile-field-value" style={{ color: 'var(--accent-cyan)' }}>#{accountDetail.id}</div>
                  </div>
                  <div>
                    <div className="profile-field-label">Mule Risk Level</div>
                    <div className="profile-field-value">
                      <span className={accountDetail.risk_score >= 0.5 ? 'badge badge-high' : accountDetail.risk_score >= 0.15 ? 'badge badge-medium' : 'badge badge-low'}>
                        {(accountDetail.risk_score * 100).toFixed(1)}% Score
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="profile-field-label">Demographic Profile</div>
                    <div className="profile-field-value" style={{ textTransform: 'capitalize' }}>
                      {accountDetail.occupation} ({accountDetail.gender})
                    </div>
                  </div>
                  <div>
                    <div className="profile-field-label">Product Type</div>
                    <div className="profile-field-value">{accountDetail.account_type}</div>
                  </div>
                  <div>
                    <div className="profile-field-label">Segment Category</div>
                    <div className="profile-field-value">{accountDetail.segment}</div>
                  </div>
                  <div>
                    <div className="profile-field-label">Geography Risk</div>
                    <div className="profile-field-value">
                      {accountDetail.geographic_zone === 'M' ? 'Metro' : accountDetail.geographic_zone === 'U' ? 'Urban' : accountDetail.geographic_zone === 'SU' ? 'Semi-Urban' : 'Rural'}
                    </div>
                  </div>
                </div>

                {/* Model Explainability Contributions */}
                <div>
                  <h4 className="card-title" style={{ fontSize: '15px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cpu size={16} className="icon-cyan" />
                    Model Interpretability Indicators (Feature Impact)
                  </h4>
                  
                  {accountDetail.contributions && accountDetail.contributions.length > 0 ? (
                    accountDetail.contributions.map((contrib, idx) => {
                      const isHighRiskVal = contrib.score_contribution > 0;
                      return (
                        <div className="contribution-row" key={`contrib-${idx}`}>
                          <div className="contribution-info">
                            <span style={{ fontWeight: '500' }}>{contrib.readable_name}</span>
                            <span style={{ color: isHighRiskVal ? 'var(--accent-pink)' : 'var(--accent-green)' }}>
                              {isHighRiskVal ? '+' : ''}{(contrib.score_contribution * 100).toFixed(1)}% risk contribution
                            </span>
                          </div>
                          <div className="contribution-bar-bg">
                            <div 
                              className="contribution-bar-fill"
                              style={{
                                width: `${contrib.contribution_weight * 100}%`,
                                backgroundColor: isHighRiskVal ? 'var(--accent-pink)' : 'var(--accent-green)',
                                opacity: 0.8
                              }}
                            ></div>
                          </div>
                          <div style={{ display: 'flex', justify: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                            <span>Account Value: {contrib.value}</span>
                            <span>Cohort Baseline: {contrib.average}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      No significant feature variance detected relative to cohort.
                    </div>
                  )}
                </div>

                {/* GenAI Explanation Narrative */}
                <div>
                  <h4 className="card-title" style={{ fontSize: '15px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Award size={16} className="icon-purple" />
                    GenAI Fraud Analyst Report
                  </h4>
                  <div 
                    className="genai-narrative"
                    dangerouslySetInnerHTML={{ 
                      __html: accountDetail.genai_explanation
                        .replace(/\n/g, '<br />')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/### (.*?)(<br \/>|$)/g, '<h3>$1</h3>')
                        .replace(/#### (.*?)(<br \/>|$)/g, '<h4>$1</h4>')
                        .replace(/- \*\*(.*?)\*\*/g, '<li><strong>$1</strong>')
                    }}
                  />
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
