/**
 * FALSE POSITIVE TEST FILE
 * 
 * This file simulates real-world code patterns that should NOT trigger
 * "type field mismatch" warnings. All field accesses here are on
 * external library objects, not on internal API types.
 * 
 * If camouf reports violations in this file, they are FALSE POSITIVES.
 * Expected violations: 0
 */

import { useCallback, useState } from 'react';
import { useNodes, useEdges, Handle, Position } from 'reactflow';
import { LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

// ============================================================================
// ReactFlow - node.data is a ReactFlow pattern, NOT APIResponse.data
// ============================================================================

interface FlowNodeData {
  label: string;
  messageType: string;
  isActive: boolean;
}

function FlowCanvas() {
  const nodes = useNodes();
  const edges = useEdges();

  // These should NOT be flagged - node.data is ReactFlow, not APIResponse
  const activeNodes = nodes.filter((node) => {
    const nodeData = node.data as FlowNodeData;
    return nodeData.isActive;
  });

  // node.data.messageType - should NOT match APIResponse.message
  nodes.forEach((node) => {
    const msgType = node.data.messageType;
    const nodeLabel = node.data.label;
    console.log(`Node ${node.id}: ${msgType} - ${nodeLabel}`);
  });

  // edge.source / edge.target - common ReactFlow properties
  edges.forEach((edge) => {
    console.log(`Edge from ${edge.source} to ${edge.target}`);
  });

  return null;
}

// ============================================================================
// DOM Events - event.metaKey is a native DOM property, NOT ResponseMeta
// ============================================================================

function InteractiveSidebar() {
  const handleKeyDown = (event: KeyboardEvent) => {
    // event.metaKey should NOT match ResponseMeta or PaginationMeta
    if (event.metaKey && event.key === 'k') {
      console.log('Command palette opened');
    }
    // event.ctrlKey, event.altKey, event.shiftKey - all DOM native
    if (event.ctrlKey) {
      console.log('Ctrl held');
    }
    const keyCode = event.keyCode;
    const charCode = event.charCode;
    console.log(keyCode, charCode);
  };

  const handleClick = (e: MouseEvent) => {
    // e.clientX, e.pageY, e.target - all DOM native
    const x = e.clientX;
    const y = e.pageY;
    const target = e.target;
    console.log(x, y, target);
  };

  return null;
}

// ============================================================================
// Recharts - item.dataKey and payload.payload are Recharts patterns
// ============================================================================

interface ChartProps {
  chartData: Array<{ name: string; value: number; revenue: number }>;
}

function RevenueChart({ chartData }: ChartProps) {
  // Custom tooltip - payload is Recharts internal structure
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      // payload[0].payload is the original data object
      const originalData = payload[0].payload;
      const dataKeyValue = payload[0].dataKey;
      return (
        <div>
          <p>{`${originalData.name}: ${payload[0].value}`}</p>
          <p>{`Key: ${dataKeyValue}`}</p>
        </div>
      );
    }
    return null;
  };

  // item.dataKey should NOT match ChartDataPoint.dataKey from shared types
  const handleLegendClick = (item: any) => {
    const clickedKey = item.dataKey;
    const fillColor = item.fill;
    console.log(`Toggled: ${clickedKey}`, fillColor);
  };

  return null;
}

// ============================================================================
// Express-like patterns - req.body, req.params, res.status
// ============================================================================

function apiMiddleware(req: any, res: any, next: any) {
  // req.body, req.params, req.query - Express request properties
  const body = req.body;
  const userId = req.params.id;
  const page = req.query.page;
  const limit = req.query.limit;

  // res.status, res.json - Express response methods
  res.status(200).json({ ok: true });

  next();
}

// ============================================================================
// Generic iterator patterns - item.* in .map()/.forEach()/.filter()
// ============================================================================

interface PipelineStep {
  name: string;
  parallelLimit: number;
  retryCount: number;
}

function processPipeline(steps: PipelineStep[]) {
  // config.parallelLimit should NOT match PaginationMeta.limit
  steps.forEach((config) => {
    const maxParallel = config.parallelLimit;
    const retries = config.retryCount;
    console.log(`Step ${config.name}: parallel=${maxParallel}, retries=${retries}`);
  });

  // item in array.map — generic iterator variable
  const names = steps.map((item) => item.name);
  const limits = steps.map((entry) => entry.parallelLimit);
  console.log(names, limits);
}

// ============================================================================
// GitHub/Bitbucket API provider patterns
// ============================================================================

interface GitHubPR {
  number: number;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  mergeable: boolean;
}

function processGitHubData(pr: GitHubPR) {
  // pr.head.ref, pr.base.ref - GitHub API specific fields
  const sourceBranch = pr.head.ref;
  const targetBranch = pr.base.ref;
  const sha = pr.head.sha;
  console.log(`PR #${pr.number}: ${sourceBranch} → ${targetBranch} (${sha})`);
}

export { FlowCanvas, InteractiveSidebar, RevenueChart, apiMiddleware, processPipeline, processGitHubData };
