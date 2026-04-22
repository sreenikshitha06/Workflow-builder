# Workflow-builder
# HR Workflow Designer

## 📌 Overview

This project is a visual **HR Workflow Designer** built using React and React Flow.
It allows users to create, edit, and simulate HR processes by connecting different types of nodes such as Start, Task, Approval, Automated, and End.

Users can visually design workflows like hiring pipelines, approval chains, or onboarding processes.

---

## 🏗 Architecture

The application is built using a **component-based architecture**:

### 1. Core Layers

* **UI Layer**

  * Built using React components
  * Includes Sidebar, Canvas, Edit Panel, and Simulation Modal

* **Flow Engine**

  * Uses React Flow for:

    * Node rendering
    * Edge connections
    * Drag-and-drop interactions

* **State Management**

  * `useNodesState` → manages nodes
  * `useEdgesState` → manages edges
  * `useState` → handles selected node and UI states

---

### 2. Main Components

* **App.jsx**

  * Main container
  * Handles layout, state, and logic

* **DynamicForm**

  * Renders different forms based on node type

* **Node Forms**

  * StartForm
  * TaskForm
  * ApprovalForm
  * AutomatedForm
  * EndForm

* **Simulation Panel**

  * Simulates workflow execution
  * Displays step-by-step results

---

### 3. Data Flow

1. User adds nodes → stored in `nodes`
2. User connects nodes → stored in `edges`
3. User edits node → updates `nodes`
4. Simulation reads nodes + edges → generates execution steps

---

## ⚙️ How to Run

### 1. Install dependencies

```bash
npm install
```

### 2. Start development server

```bash
npm run dev
```

### 3. Open in browser

```
http://localhost:5173/
```

---

## 🎯 Features

* Add different node types:

  * Start
  * Task
  * Approval
  * Automated
  * End

* Drag and connect nodes visually

* Dynamic form editing:

  * Task → assignee, description
  * Approval → role, threshold
  * Automated → action + parameters

* Delete nodes with automatic edge cleanup

* Workflow simulation:

  * Executes nodes step-by-step
  * Displays results in a timeline

---

## 🧠 Design Decisions

### 1. Use of React Flow

React Flow was chosen because it provides:

* Built-in drag-and-drop
* Edge connections
* Interactive node system

This reduced complexity and allowed focus on logic.

---

### 2. Dynamic Forms per Node Type

Instead of a single form, separate forms were created:

* Improves clarity
* Matches real-world workflow systems
* Makes code modular

---

### 3. Mock API Layer

A mock API was implemented to simulate:

* GET `/automations`
* POST `/simulate`

This avoids backend dependency while still demonstrating API integration.

---

### 4. Separation of Concerns

* UI logic, form logic, and simulation logic are separated
* Improves readability and maintainability

---

### 5. Simplified Simulation

Workflow execution is simulated instead of fully executed:

* Focuses on concept rather than backend complexity
* Makes it easier to demonstrate in a frontend-only project

---

## ✅ What I Completed

* Full workflow builder UI
* Node creation and connection
* Dynamic forms for different node types
* Node deletion with edge cleanup
* Simulation panel with step-by-step execution
* Mock API integration

---

## 🚀 What I Would Add With More Time

* Backend integration (real API instead of mock)
* Workflow persistence (save/load workflows)
* Advanced validation (cycle detection, error handling)
* Role-based access for approvals
* Drag-and-drop node palette
* Better UI/UX (animations, styling improvements)
* Export workflow as PDF or report

---

## 📊 Conclusion

This project demonstrates:

* Frontend architecture skills
* State management
* Dynamic UI handling
* Real-world workflow modeling

It simulates how enterprise workflow tools operate while keeping the implementation manageable and extensible.

---
