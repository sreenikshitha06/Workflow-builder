// ================================================================
// HR Workflow Designer - App.jsx
// Full-featured: dynamic forms, mock API, simulation, delete, export
// ================================================================

import { useState, useCallback, useEffect, useRef } from "react";
import ReactFlow, {
  addEdge,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

// ================================================================
// SECTION 1 — MOCK API LAYER
// Simulates GET /automations and POST /simulate locally (no server)
// ================================================================

const MOCK_AUTOMATIONS = [
  { id: "send_email",     label: "Send Email",           params: ["to", "subject", "body"] },
  { id: "generate_doc",  label: "Generate Document",     params: ["template", "recipient"] },
  { id: "notify_slack",  label: "Notify Slack Channel",  params: ["channel", "message"] },
  { id: "create_ticket", label: "Create JIRA Ticket",    params: ["project", "summary", "priority"] },
  { id: "assign_role",   label: "Assign Role",           params: ["userId", "role"] },
];

// Mock GET /automations — returns list of available automated actions
const apiGetAutomations = () =>
  new Promise((res) => setTimeout(() => res(MOCK_AUTOMATIONS), 200));

// Mock POST /simulate — validates graph structure & returns step-by-step log
const apiSimulate = (workflowJSON) =>
  new Promise((res) => {
    setTimeout(() => {
      const { nodes, edges } = workflowJSON;
      const errors = [];

      // Validation 1: must have at least one Start and one End node
      const hasStart = nodes.some((n) => n.data.nodeType === "Start");
      const hasEnd   = nodes.some((n) => n.data.nodeType === "End");
      if (!hasStart) errors.push("❌ Missing Start node");
      if (!hasEnd)   errors.push("❌ Missing End node");

      // Validation 2: every non-End node must have an outgoing edge
      const sourcedIds = new Set(edges.map((e) => e.source));
      nodes.forEach((n) => {
        if (n.data.nodeType !== "End" && !sourcedIds.has(n.id))
          errors.push(`⚠️ Node "${n.data.label}" has no outgoing connection`);
      });

      // Validation 3: cycle detection via DFS
      const adj = {};
      edges.forEach((e) => {
        if (!adj[e.source]) adj[e.source] = [];
        adj[e.source].push(e.target);
      });
      const visited = new Set();
      const recStack = new Set();
      const hasCycle = (id) => {
        visited.add(id); recStack.add(id);
        for (const nb of (adj[id] || [])) {
          if (!visited.has(nb) && hasCycle(nb)) return true;
          if (recStack.has(nb)) return true;
        }
        recStack.delete(id);
        return false;
      };
      nodes.forEach((n) => { if (!visited.has(n.id)) hasCycle(n.id); });
      if (recStack.size > 0) errors.push("🔁 Cycle detected in workflow");

      if (errors.length > 0) { res({ success: false, errors, steps: [] }); return; }

      // Build execution order by walking edges from the Start node
      const edgeMap = {};
      edges.forEach((e) => { edgeMap[e.source] = e.target; });
      const startNode = nodes.find((n) => n.data.nodeType === "Start");
      const steps = [];
      let cur = startNode?.id;
      const seen = new Set();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const node = nodes.find((n) => n.id === cur);
        if (!node) break;
        steps.push({
          id: node.id, type: node.data.nodeType, label: node.data.label,
          status: "✅ Executed", detail: buildStepDetail(node.data),
        });
        cur = edgeMap[cur];
      }
      res({ success: true, errors: [], steps });
    }, 700);
  });

// Generate a human-readable detail line for each node type
const buildStepDetail = (data) => {
  switch (data.nodeType) {
    case "Start":     return `Started. ${(data.metadata||[]).length ? "Meta: "+data.metadata.map(m=>`${m.key}=${m.value}`).join(", ") : "No metadata"}`;
    case "Task":      return `Assignee: ${data.assignee||"Unassigned"} | Due: ${data.dueDate||"—"} | ${data.description||"No description"}`;
    case "Approval":  return `Approver: ${data.approverRole||"—"} | Threshold: ${data.threshold??0} days`;
    case "Automated": return `Action: ${data.actionId||"None"} | Params: ${JSON.stringify(data.actionParams||{})}`;
    case "End":       return `Message: "${data.endMessage||"Done"}" | Summary: ${data.summaryFlag?"Yes":"No"}`;
    default:          return "";
  }
};

// ================================================================
// SECTION 2 — NODE VISUAL METADATA
// ================================================================

const NODE_META = {
  Start:     { bg: "#ecfdf5", border: "#10b981", text: "#064e3b", icon: "🟢" },
  Task:      { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a", icon: "📋" },
  Approval:  { bg: "#fffbeb", border: "#f59e0b", text: "#78350f", icon: "✅" },
  Automated: { bg: "#f5f3ff", border: "#7c3aed", text: "#3b0764", icon: "⚡" },
  End:       { bg: "#fff1f2", border: "#f43f5e", text: "#881337", icon: "🔴" },
};

const makeNodeStyle = (type) => ({
  background: NODE_META[type]?.bg || "#f8fafc",
  border: `2px solid ${NODE_META[type]?.border || "#94a3b8"}`,
  borderRadius: 12,
  color: NODE_META[type]?.text || "#1e293b",
  fontWeight: 600,
  fontSize: 13,
  padding: "10px 18px",
  minWidth: 155,
  cursor: "grab",
  boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
});

// ================================================================
// SECTION 3 — INITIAL DEMO GRAPH
// ================================================================

let _idCounter = 5;
const nextId = () => String(++_idCounter);

const initialNodes = [
  { id:"1", type:"default", position:{x:60,  y:200}, style:makeNodeStyle("Start"),     data:{ label:"🟢 Start",          nodeType:"Start",     metadata:[] } },
  { id:"2", type:"default", position:{x:290, y:200}, style:makeNodeStyle("Task"),      data:{ label:"📋 Review Resume",   nodeType:"Task",      description:"Screen candidate resume", assignee:"hr@company.com", dueDate:"", customFields:[] } },
  { id:"3", type:"default", position:{x:540, y:200}, style:makeNodeStyle("Approval"),  data:{ label:"✅ Manager Approval",nodeType:"Approval",  approverRole:"Manager", threshold:2 } },
  { id:"4", type:"default", position:{x:790, y:200}, style:makeNodeStyle("Automated"), data:{ label:"⚡ Send Offer Email", nodeType:"Automated", actionId:"send_email", actionParams:{to:"",subject:"",body:""} } },
  { id:"5", type:"default", position:{x:1040,y:200}, style:makeNodeStyle("End"),       data:{ label:"🔴 End",             nodeType:"End",       endMessage:"Hiring complete!", summaryFlag:true } },
];

const initialEdges = [
  { id:"e1-2", source:"1", target:"2", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
  { id:"e2-3", source:"2", target:"3", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
  { id:"e3-4", source:"3", target:"4", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
  { id:"e4-5", source:"4", target:"5", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
];

// ================================================================
// SECTION 4 — REUSABLE FORM COMPONENTS
// ================================================================

// Labelled form field wrapper
const Field = ({ label, children }) => (
  <div style={fs.field}>
    <label style={fs.label}>{label}</label>
    {children}
  </div>
);

// Dynamic key-value pair editor (used for metadata and custom fields)
const KVEditor = ({ pairs, onChange, sectionLabel }) => {
  const add    = () => onChange([...pairs, { key:"", value:"" }]);
  const remove = (i) => onChange(pairs.filter((_,idx)=>idx!==i));
  const update = (i, field, val) => onChange(pairs.map((p,idx)=>idx===i?{...p,[field]:val}:p));
  return (
    <div style={fs.kvBlock}>
      <div style={fs.kvHeader}>
        <span style={fs.kvTitle}>{sectionLabel}</span>
        <button onClick={add} style={fs.kvAdd}>+ Add</button>
      </div>
      {pairs.length===0 && <p style={fs.kvEmpty}>No entries yet</p>}
      {pairs.map((p,i)=>(
        <div key={i} style={fs.kvRow}>
          <input style={fs.kvInput} placeholder="key"   value={p.key}   onChange={e=>update(i,"key",e.target.value)} />
          <input style={fs.kvInput} placeholder="value" value={p.value} onChange={e=>update(i,"value",e.target.value)} />
          <button onClick={()=>remove(i)} style={fs.kvRemove}>✕</button>
        </div>
      ))}
    </div>
  );
};

// Toggle switch component for boolean fields
const Toggle = ({ value, onChange, trueLabel="Enabled", falseLabel="Disabled" }) => (
  <div style={fs.toggleRow}>
    <div style={{...fs.toggle, background: value?"#10b981":"#cbd5e1"}} onClick={()=>onChange(!value)}>
      <div style={{...fs.knob, left: value?22:2}} />
    </div>
    <span style={fs.toggleLabel}>{value?trueLabel:falseLabel}</span>
  </div>
);

// ================================================================
// SECTION 5 — NODE-SPECIFIC EDIT FORMS
// Each form is a controlled component that calls onChange(newData)
// ================================================================

// START node — title + optional metadata
const StartForm = ({ data, onChange }) => (
  <div style={fs.formBlock}>
    <Field label="Title *">
      <input style={fs.input} value={data.label.replace(/^🟢\s*/,"")}
        onChange={e=>onChange({...data, label:`🟢 ${e.target.value}`})} />
    </Field>
    <KVEditor sectionLabel="Metadata (optional)" pairs={data.metadata||[]} onChange={v=>onChange({...data,metadata:v})} />
  </div>
);

// TASK node — title, description, assignee, due date, custom fields
const TaskForm = ({ data, onChange }) => (
  <div style={fs.formBlock}>
    <Field label="Title *">
      <input style={fs.input} value={data.label.replace(/^📋\s*/,"")}
        onChange={e=>onChange({...data, label:`📋 ${e.target.value}`})} />
    </Field>
    <Field label="Description">
      <textarea style={{...fs.input, height:64, resize:"vertical"}}
        value={data.description||""} onChange={e=>onChange({...data,description:e.target.value})} />
    </Field>
    <Field label="Assignee">
      <input style={fs.input} placeholder="e.g. alice@company.com"
        value={data.assignee||""} onChange={e=>onChange({...data,assignee:e.target.value})} />
    </Field>
    <Field label="Due Date">
      <input style={fs.input} type="date"
        value={data.dueDate||""} onChange={e=>onChange({...data,dueDate:e.target.value})} />
    </Field>
    <KVEditor sectionLabel="Custom Fields" pairs={data.customFields||[]} onChange={v=>onChange({...data,customFields:v})} />
  </div>
);

// APPROVAL node — title, approver role dropdown, threshold
const ApprovalForm = ({ data, onChange }) => (
  <div style={fs.formBlock}>
    <Field label="Title *">
      <input style={fs.input} value={data.label.replace(/^✅\s*/,"")}
        onChange={e=>onChange({...data, label:`✅ ${e.target.value}`})} />
    </Field>
    <Field label="Approver Role">
      <select style={fs.input} value={data.approverRole||"Manager"}
        onChange={e=>onChange({...data,approverRole:e.target.value})}>
        {["Manager","HRBP","Director","VP","CEO"].map(r=><option key={r}>{r}</option>)}
      </select>
    </Field>
    <Field label="Auto-Approve Threshold (days)">
      <input style={fs.input} type="number" min={0}
        value={data.threshold??1} onChange={e=>onChange({...data,threshold:Number(e.target.value)})} />
    </Field>
  </div>
);

// AUTOMATED node — title, action picker from mock API, dynamic params
const AutomatedForm = ({ data, onChange, automations }) => {
  // When user changes the action, reset param values to empty strings
  const handleActionChange = (id) => {
    const action = automations.find(a=>a.id===id);
    const emptyParams = {};
    (action?.params||[]).forEach(p=>{ emptyParams[p]=""; });
    onChange({...data, actionId:id, actionParams:emptyParams});
  };

  const selectedAction = automations.find(a=>a.id===data.actionId);

  return (
    <div style={fs.formBlock}>
      <Field label="Title *">
        <input style={fs.input} value={data.label.replace(/^⚡\s*/,"")}
          onChange={e=>onChange({...data, label:`⚡ ${e.target.value}`})} />
      </Field>
      <Field label="Action (from /automations)">
        <select style={fs.input} value={data.actionId||""}
          onChange={e=>handleActionChange(e.target.value)}>
          <option value="">— Select an action —</option>
          {automations.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </Field>

      {/* Dynamic parameters rendered based on the selected action's param list */}
      {selectedAction && (
        <div style={fs.paramsBox}>
          <p style={fs.paramsTitle}>⚙️ Parameters for "{selectedAction.label}"</p>
          {selectedAction.params.map(param=>(
            <Field key={param} label={param}>
              <input style={fs.input} placeholder={`Enter ${param}`}
                value={(data.actionParams||{})[param]||""}
                onChange={e=>onChange({...data, actionParams:{...(data.actionParams||{}), [param]:e.target.value}})} />
            </Field>
          ))}
        </div>
      )}
    </div>
  );
};

// END node — title, end message, summary flag toggle
const EndForm = ({ data, onChange }) => (
  <div style={fs.formBlock}>
    <Field label="Title">
      <input style={fs.input} value={data.label.replace(/^🔴\s*/,"")}
        onChange={e=>onChange({...data, label:`🔴 ${e.target.value}`})} />
    </Field>
    <Field label="End Message">
      <input style={fs.input} placeholder="e.g. Workflow complete!"
        value={data.endMessage||""} onChange={e=>onChange({...data,endMessage:e.target.value})} />
    </Field>
    <Field label="Summary Flag">
      <Toggle value={!!data.summaryFlag} onChange={v=>onChange({...data,summaryFlag:v})} />
    </Field>
  </div>
);

// Router: picks the right form component by nodeType
const DynamicForm = ({ data, onChange, automations }) => {
  switch (data.nodeType) {
    case "Start":     return <StartForm     data={data} onChange={onChange} />;
    case "Task":      return <TaskForm      data={data} onChange={onChange} />;
    case "Approval":  return <ApprovalForm  data={data} onChange={onChange} />;
    case "Automated": return <AutomatedForm data={data} onChange={onChange} automations={automations} />;
    case "End":       return <EndForm       data={data} onChange={onChange} />;
    default:          return <p style={{color:"#94a3b8",fontSize:13}}>Unknown node type</p>;
  }
};

// ================================================================
// SECTION 6 — SIMULATION / SANDBOX PANEL (modal)
// ================================================================

const SimulationPanel = ({ onClose, nodes, edges }) => {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setResult(null);
    const res = await apiSimulate({ nodes, edges });
    setResult(res); setLoading(false);
  };

  // Auto-run as soon as the panel opens
  useEffect(() => { run(); }, []);

  // Export current workflow as a downloadable JSON file
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({nodes,edges},null,2)],{type:"application/json"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "workflow.json"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={sp.overlay}>
      <div style={sp.modal}>
        {/* Header */}
        <div style={sp.header}>
          <div>
            <div style={sp.title}>🧪 Workflow Simulation</div>
            <div style={sp.subtitle}>POST /simulate · Step-by-step execution log</div>
          </div>
          <button onClick={onClose} style={sp.closeBtn}>✕</button>
        </div>

        {/* Body */}
        <div style={sp.body}>
          {loading && <div style={sp.loading}>⏳ Running simulation via mock API…</div>}

          {/* Validation errors */}
          {result && !result.success && (
            <div style={sp.errBox}>
              <p style={sp.errTitle}>⛔ Validation Failed — Fix these issues before running:</p>
              {result.errors.map((e,i)=><p key={i} style={sp.errLine}>{e}</p>)}
            </div>
          )}

          {/* Successful execution timeline */}
          {result?.success && (
            <div>
              <p style={sp.successBanner}>✅ Simulation complete — {result.steps.length} steps executed</p>
              <div style={sp.timeline}>
                {result.steps.map((step, i) => (
                  <div key={step.id} style={sp.stepRow}>
                    <div style={{...sp.dot, background: NODE_META[step.type]?.border||"#64748b"}}>{i+1}</div>
                    <div style={sp.stepBody}>
                      <div style={sp.stepLabel}>
                        {step.label}
                        <span style={{...sp.stepBadge, background:NODE_META[step.type]?.bg, color:NODE_META[step.type]?.text}}>
                          {step.type}
                        </span>
                      </div>
                      <div style={sp.stepStatus}>{step.status}</div>
                      <div style={sp.stepDetail}>{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={sp.footer}>
          <button onClick={run}       style={sp.rerunBtn}>↩ Re-run</button>
          <button onClick={exportJSON} style={sp.exportBtn}>📥 Export JSON</button>
        </div>
      </div>
    </div>
  );
};

// ================================================================
// SECTION 7 — MAIN APP COMPONENT
// ================================================================

export default function App() {
  // ── React Flow state ──
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // ── UI state ──
  const [selectedNode, setSelectedNode] = useState(null); // node being edited
  const [showSim,      setShowSim]      = useState(false); // simulation modal open?
  const [automations,  setAutomations]  = useState([]);    // from mock GET /automations

  // ── Undo/Redo history stack ──
  const [history,    setHistory]    = useState([]); // array of {nodes, edges} snapshots
  const [historyPtr, setHistoryPtr] = useState(-1); // pointer into history

  // ── Load automations once on mount ──
  useEffect(() => { apiGetAutomations().then(setAutomations); }, []);

  // Snapshot current state into undo history
  const pushHistory = useCallback((ns, es) => {
    const snap = { nodes: JSON.parse(JSON.stringify(ns)), edges: JSON.parse(JSON.stringify(es)) };
    setHistory(prev => [...prev.slice(0, historyPtr+1), snap]);
    setHistoryPtr(prev => prev+1);
  }, [historyPtr]);

  const undo = () => {
    if (historyPtr <= 0) return;
    const snap = history[historyPtr-1];
    setNodes(snap.nodes); setEdges(snap.edges); setHistoryPtr(p=>p-1); setSelectedNode(null);
  };

  const redo = () => {
    if (historyPtr >= history.length-1) return;
    const snap = history[historyPtr+1];
    setNodes(snap.nodes); setEdges(snap.edges); setHistoryPtr(p=>p+1); setSelectedNode(null);
  };

  // ── Connect two nodes by dragging ──
  const onConnect = useCallback((params) => {
    setEdges(eds => {
      const newEdges = addEdge({...params, animated:true, markerEnd:{type:MarkerType.ArrowClosed}}, eds);
      pushHistory(nodes, newEdges);
      return newEdges;
    });
  }, [nodes, pushHistory]);

  // ── Click node → select it and open edit panel ──
  const onNodeClick = useCallback((_evt, node) => {
    setSelectedNode(node);
  }, []);

  // ── Click canvas background → deselect ──
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // ── Update node data from the dynamic form (controlled) ──
  const onFormChange = useCallback((newData) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== selectedNode?.id) return n;
      return { ...n, data: newData, style: makeNodeStyle(newData.nodeType) };
    }));
    // Keep selectedNode in sync so the form re-renders correctly
    setSelectedNode(prev => prev ? { ...prev, data: newData } : null);
  }, [selectedNode]);

  // ── Add a new node of the chosen type ──
  const addNode = (nodeType) => {
    const id = nextId();
    const defaults = {
      Start:     { label:"🟢 Start",     nodeType:"Start",     metadata:[] },
      Task:      { label:"📋 New Task",  nodeType:"Task",      description:"", assignee:"", dueDate:"", customFields:[] },
      Approval:  { label:"✅ Approval",  nodeType:"Approval",  approverRole:"Manager", threshold:1 },
      Automated: { label:"⚡ Auto Step", nodeType:"Automated", actionId:"", actionParams:{} },
      End:       { label:"🔴 End",       nodeType:"End",       endMessage:"", summaryFlag:false },
    };
    const newNode = {
      id, type:"default",
      // Spread positions so nodes don't stack directly on top of each other
      position: { x: 120 + (parseInt(id)%7)*80, y: 80 + (parseInt(id)%4)*90 },
      data: defaults[nodeType],
      style: makeNodeStyle(nodeType),
    };
    const newNodes = [...nodes, newNode];
    setNodes(newNodes);
    pushHistory(newNodes, edges);
  };

  // ── Delete the currently selected node + its edges ──
  const deleteSelected = () => {
    if (!selectedNode) return;
    const newNodes = nodes.filter(n => n.id !== selectedNode.id);
    const newEdges = edges.filter(e => e.source!==selectedNode.id && e.target!==selectedNode.id);
    setNodes(newNodes); setEdges(newEdges); setSelectedNode(null);
    pushHistory(newNodes, newEdges);
  };

  // ── Import workflow from a JSON file ──
  const importRef = useRef();
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { nodes: ns, edges: es } = JSON.parse(ev.target.result);
        setNodes(ns); setEdges(es); setSelectedNode(null);
      } catch { alert("❌ Invalid workflow JSON file"); }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset so same file can be re-imported
  };

  // ================================================================
  // RENDER
  // ================================================================
  return (
    <div style={layout.root}>
      {/* Fonts + global resets */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif;background:#f1f5f9}
        input,select,textarea,button{font-family:'DM Sans',sans-serif}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
      `}</style>

      {/* ── Top header ── */}
      <header style={layout.header}>
        <div style={layout.hLeft}>
          <span style={layout.logo}>⚙️</span>
          <div>
            <div style={layout.appName}>HR Workflow Designer</div>
            <div style={layout.appSub}>Tredence Analytics · Visual Process Builder</div>
          </div>
        </div>
        <div style={layout.hRight}>
          <button onClick={undo} disabled={historyPtr<=0}
            style={{...layout.iconBtn, opacity:historyPtr<=0?0.4:1}} title="Undo">↩ Undo</button>
          <button onClick={redo} disabled={historyPtr>=history.length-1}
            style={{...layout.iconBtn, opacity:historyPtr>=history.length-1?0.4:1}} title="Redo">↪ Redo</button>
          <button onClick={()=>importRef.current.click()} style={layout.iconBtn} title="Import JSON">📂 Import</button>
          <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport} />
          <button onClick={()=>setShowSim(true)} style={layout.runBtn}>▶ Run Simulation</button>
        </div>
      </header>

      <div style={layout.body}>

        {/* ── Left sidebar: node palette + delete ── */}
        <aside style={layout.sidebar}>
          <p style={layout.sLabel}>ADD NODES</p>
          {Object.entries(NODE_META).map(([type, meta])=>(
            <button key={type} onClick={()=>addNode(type)}
              style={{...layout.nodeBtn, background:meta.bg, borderColor:meta.border, color:meta.text}}>
              {meta.icon} {type}
            </button>
          ))}

          <hr style={layout.hr} />

          <p style={layout.sLabel}>SELECTED</p>
          {selectedNode ? (
            <>
              <div style={layout.selInfo}>
                <span style={{fontSize:18}}>{NODE_META[selectedNode.data.nodeType]?.icon}</span>
                <span style={{fontSize:12,fontWeight:600,color:"#1e293b",lineHeight:1.3}}>
                  {selectedNode.data.label.replace(/^[^\s]+\s/,"")}
                </span>
              </div>
              <button onClick={deleteSelected} style={layout.delBtn}>🗑 Delete Node</button>
            </>
          ) : (
            <p style={layout.hint}>Click a node to select it</p>
          )}

          <hr style={layout.hr} />
          <p style={layout.sLabel}>TIPS</p>
          <p style={layout.hint}>• Drag a handle to connect nodes</p>
          <p style={layout.hint}>• Press Delete key to remove edges</p>
          <p style={layout.hint}>• Click canvas to deselect</p>
          <p style={layout.hint}>• Use ↩↪ to undo / redo</p>
        </aside>

        {/* ── Canvas ── */}
        <main style={layout.canvas}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            deleteKeyCode="Delete"
            attributionPosition="bottom-right"
          >
            <MiniMap nodeColor={n=>NODE_META[n.data?.nodeType]?.border||"#94a3b8"} pannable zoomable />
            <Controls />
            <Background gap={18} color="#e2e8f0" />
          </ReactFlow>
        </main>

        {/* ── Right edit panel (only when a node is selected) ── */}
        {selectedNode && (
          <aside style={layout.editPanel}>
            {/* Panel header */}
            <div style={ep.header}>
              <div>
                <div style={ep.title}>Edit Node</div>
                <div style={{
                  ...ep.badge,
                  background: NODE_META[selectedNode.data.nodeType]?.bg,
                  color: NODE_META[selectedNode.data.nodeType]?.text,
                  border: `1px solid ${NODE_META[selectedNode.data.nodeType]?.border}`,
                }}>
                  {NODE_META[selectedNode.data.nodeType]?.icon} {selectedNode.data.nodeType}
                </div>
              </div>
              <button onClick={()=>setSelectedNode(null)} style={ep.closeBtn}>✕</button>
            </div>

            {/* Scrollable form area */}
            <div style={ep.scroll}>
              <DynamicForm
                data={selectedNode.data}
                onChange={onFormChange}
                automations={automations}
              />
            </div>

            {/* Panel footer */}
            <div style={ep.footer}>
              <button onClick={deleteSelected} style={ep.delBtn}>🗑 Delete</button>
              <button onClick={()=>setSelectedNode(null)} style={ep.doneBtn}>✓ Done</button>
            </div>
          </aside>
        )}
      </div>

      {/* ── Simulation modal ── */}
      {showSim && (
        <SimulationPanel
          onClose={()=>setShowSim(false)}
          nodes={nodes}
          edges={edges}
        />
      )}
    </div>
  );
}

// ================================================================
// SECTION 8 — ALL STYLE OBJECTS
// ================================================================

// Layout
const layout = {
  root: { display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden", fontFamily:"'DM Sans',sans-serif" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 22px", height:56, background:"#0f172a", color:"#f8fafc", flexShrink:0, boxShadow:"0 2px 16px rgba(0,0,0,0.35)" },
  hLeft: { display:"flex", alignItems:"center", gap:12 },
  logo: { fontSize:24 },
  appName: { fontWeight:700, fontSize:15, letterSpacing:0.2 },
  appSub: { fontSize:10.5, color:"#64748b", marginTop:1.5 },
  hRight: { display:"flex", alignItems:"center", gap:8 },
  iconBtn: { padding:"6px 12px", background:"#1e293b", border:"1px solid #334155", borderRadius:7, color:"#94a3b8", cursor:"pointer", fontSize:12, fontWeight:500 },
  runBtn: { padding:"8px 18px", background:"#10b981", border:"none", borderRadius:8, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" },
  body: { display:"flex", flex:1, overflow:"hidden" },
  sidebar: { width:168, background:"#fff", borderRight:"1px solid #e2e8f0", padding:"14px 11px", display:"flex", flexDirection:"column", gap:6, overflowY:"auto", flexShrink:0 },
  sLabel: { fontSize:9.5, fontWeight:700, letterSpacing:1.3, color:"#94a3b8", textTransform:"uppercase", marginBottom:1 },
  nodeBtn: { padding:"8px 10px", borderRadius:8, border:"2px solid", cursor:"pointer", fontWeight:600, fontSize:12, textAlign:"left" },
  hr: { border:"none", borderTop:"1px solid #f1f5f9", margin:"4px 0" },
  selInfo: { display:"flex", alignItems:"center", gap:8, padding:"6px 8px", background:"#f8fafc", borderRadius:7, marginBottom:4 },
  delBtn: { padding:"8px 10px", borderRadius:8, border:"1.5px solid #fca5a5", background:"#fff1f2", color:"#b91c1c", cursor:"pointer", fontWeight:600, fontSize:12 },
  hint: { fontSize:11, color:"#94a3b8", lineHeight:1.65 },
  canvas: { flex:1, position:"relative" },
  editPanel: { width:292, background:"#fff", borderLeft:"1px solid #e2e8f0", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"hidden" },
};

// Edit panel
const ep = {
  header: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"14px 16px 10px", borderBottom:"1px solid #f1f5f9", flexShrink:0 },
  title: { fontWeight:700, fontSize:15, color:"#0f172a", marginBottom:6 },
  badge: { display:"inline-block", padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600 },
  closeBtn: { background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8", flexShrink:0 },
  scroll: { flex:1, overflowY:"auto", padding:"2px 16px 16px" },
  footer: { padding:"11px 16px", borderTop:"1px solid #f1f5f9", display:"flex", gap:8, flexShrink:0 },
  delBtn: { flex:1, padding:"9px 0", background:"#fff1f2", border:"1.5px solid #fca5a5", borderRadius:8, color:"#b91c1c", cursor:"pointer", fontWeight:600, fontSize:12 },
  doneBtn: { flex:2, padding:"9px 0", background:"#0f172a", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13 },
};

// Form styles
const fs = {
  formBlock: { paddingTop:10, display:"flex", flexDirection:"column", gap:11 },
  field: { display:"flex", flexDirection:"column", gap:4 },
  label: { fontSize:10.5, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:0.5 },
  input: { padding:"7px 10px", border:"1.5px solid #e2e8f0", borderRadius:7, fontSize:13, color:"#1e293b", outline:"none", width:"100%", background:"#fff" },
  kvBlock: { background:"#f8fafc", borderRadius:8, padding:"10px 10px 8px", display:"flex", flexDirection:"column", gap:5 },
  kvHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 },
  kvTitle: { fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:0.5 },
  kvAdd: { fontSize:11, padding:"2px 8px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:5, color:"#2563eb", cursor:"pointer", fontWeight:600 },
  kvEmpty: { fontSize:11, color:"#cbd5e1", fontStyle:"italic" },
  kvRow: { display:"flex", gap:5, alignItems:"center" },
  kvInput: { flex:1, padding:"5px 7px", border:"1.5px solid #e2e8f0", borderRadius:6, fontSize:12, color:"#1e293b", outline:"none" },
  kvRemove: { background:"none", border:"none", color:"#f43f5e", cursor:"pointer", fontSize:15, lineHeight:1, flexShrink:0 },
  paramsBox: { background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:8, padding:"10px 10px 6px", display:"flex", flexDirection:"column", gap:8 },
  paramsTitle: { fontSize:10.5, fontWeight:700, color:"#7c3aed", textTransform:"uppercase", letterSpacing:0.5 },
  toggleRow: { display:"flex", alignItems:"center", gap:10, marginTop:2 },
  toggle: { width:44, height:24, borderRadius:12, position:"relative", cursor:"pointer", transition:"background 0.25s", flexShrink:0 },
  knob: { position:"absolute", top:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.25s", boxShadow:"0 1px 4px rgba(0,0,0,0.18)" },
  toggleLabel: { fontSize:13, color:"#475569", fontWeight:500 },
};

// Simulation panel
const sp = {
  overlay: { position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(4px)" },
  modal: { background:"#fff", borderRadius:16, width:"min(680px,95vw)", maxHeight:"82vh", display:"flex", flexDirection:"column", boxShadow:"0 32px 80px rgba(0,0,0,0.28)" },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 22px 12px", borderBottom:"1px solid #f1f5f9" },
  title: { fontWeight:700, fontSize:17, color:"#0f172a" },
  subtitle: { fontSize:11, color:"#94a3b8", marginTop:2 },
  closeBtn: { background:"none", border:"none", cursor:"pointer", fontSize:19, color:"#94a3b8" },
  body: { flex:1, overflowY:"auto", padding:"18px 22px" },
  loading: { textAlign:"center", padding:"36px 0", color:"#64748b", fontSize:14 },
  errBox: { background:"#fff1f2", border:"1px solid #fecaca", borderRadius:10, padding:"14px 16px" },
  errTitle: { fontWeight:700, color:"#b91c1c", fontSize:13, marginBottom:8 },
  errLine: { fontSize:13, color:"#991b1b", marginBottom:4, lineHeight:1.5 },
  successBanner: { fontWeight:700, color:"#065f46", fontSize:13, marginBottom:16, padding:"10px 14px", background:"#ecfdf5", borderRadius:8, border:"1px solid #a7f3d0" },
  timeline: { display:"flex", flexDirection:"column", gap:0 },
  stepRow: { display:"flex", gap:14, position:"relative", paddingBottom:18 },
  dot: { width:28, height:28, borderRadius:"50%", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 },
  stepBody: { flex:1, paddingTop:3, borderBottom:"1px dashed #e2e8f0", paddingBottom:12 },
  stepLabel: { fontWeight:700, fontSize:14, color:"#1e293b", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  stepBadge: { fontSize:10, fontWeight:600, padding:"1px 8px", borderRadius:10 },
  stepStatus: { fontSize:12, color:"#10b981", marginTop:3 },
  stepDetail: { fontSize:11.5, color:"#64748b", marginTop:5, fontFamily:"'JetBrains Mono',monospace", background:"#f8fafc", padding:"6px 9px", borderRadius:6, wordBreak:"break-word" },
  footer: { padding:"14px 22px", borderTop:"1px solid #f1f5f9", display:"flex", gap:10 },
  rerunBtn: { padding:"9px 18px", background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:8, color:"#475569", cursor:"pointer", fontWeight:600, fontSize:13 },
  exportBtn: { padding:"9px 18px", background:"#0f172a", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13 },
};