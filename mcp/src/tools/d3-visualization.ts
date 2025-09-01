/**
 * D3 Visualization Tool for MCP Server
 *
 * Generates D3.js visualization code based on data and requirements
 * Returns ready-to-render D3 code for the frontend
 */

import Anthropic from '@anthropic-ai/sdk';

export interface VisualizationRequest {
  data: any[];
  type:
    | 'bar'
    | 'line'
    | 'pie'
    | 'scatter'
    | 'area'
    | 'bubble'
    | 'heatmap'
    | 'network'
    | 'tree'
    | 'auto';
  title?: string;
  description?: string;
  width?: number;
  height?: number;
  xAxis?: {
    label?: string;
    field?: string;
  };
  yAxis?: {
    label?: string;
    field?: string;
  };
  colorScheme?: string;
  interactive?: boolean;
}

export interface D3VisualizationResponse {
  code: string;
  dependencies: string[];
  containerRequirements: {
    id: string;
    width: number;
    height: number;
  };
  dataFormat: string;
  instructions: string;
}

/**
 * Generate D3.js visualization code using AI
 */
async function generateD3CodeWithAI(
  data: any[],
  type: string,
  requirements: Partial<VisualizationRequest>,
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  const dataSample = data.slice(0, 5);
  const dataStructure = dataSample.length > 0 ? Object.keys(dataSample[0]) : [];

  const prompt = `Generate D3.js v7 visualization code for the following requirements:

Data Structure:
- Fields: ${dataStructure.join(', ')}
- Sample data (first 5 rows): ${JSON.stringify(dataSample, null, 2)}
- Total rows: ${data.length}

Visualization Requirements:
- Type: ${type}
- Title: ${requirements.title || 'Data Visualization'}
- Width: ${requirements.width || 800}px
- Height: ${requirements.height || 600}px
- X-Axis: ${requirements.xAxis?.label || 'auto'} (field: ${requirements.xAxis?.field || 'auto'})
- Y-Axis: ${requirements.yAxis?.label || 'auto'} (field: ${requirements.yAxis?.field || 'auto'})
- Interactive: ${requirements.interactive !== false}

Generate ONLY the D3.js JavaScript code that:
1. Creates a complete, working visualization
2. Assumes the data is available in a variable called 'data'
3. Renders into a div with id 'visualization-container'
4. Includes responsive design
5. Includes tooltips if interactive
6. Uses modern D3.js v7 syntax
7. Includes proper scales, axes, and labels
8. Has clean, professional styling

Return only the JavaScript code, no explanations or markdown.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0,
      system:
        'You are a D3.js expert. Generate clean, efficient, and modern D3.js visualization code. Return only JavaScript code without markdown formatting or explanations.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    let code = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Clean up any markdown formatting if present
    code = code
      .replace(/```javascript/gi, '')
      .replace(/```js/gi, '')
      .replace(/```/g, '')
      .trim();

    return code;
  } catch (error) {
    console.error('Error generating D3 code with AI:', error);
    // Fallback to template-based generation
    return generateD3Template(type, data, requirements);
  }
}

/**
 * Generate D3 visualization code using templates (fallback)
 */
function generateD3Template(
  type: string,
  data: any[],
  requirements: Partial<VisualizationRequest>,
): string {
  const width = requirements.width || 800;
  const height = requirements.height || 600;
  const margin = { top: 50, right: 50, bottom: 70, left: 70 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Detect data fields
  const fields = data.length > 0 ? Object.keys(data[0]) : [];
  const xField = requirements.xAxis?.field || fields[0] || 'x';
  const yField = requirements.yAxis?.field || fields[1] || 'y';

  switch (type) {
    case 'bar':
      return `
// D3.js Bar Chart
const margin = {top: ${margin.top}, right: ${margin.right}, bottom: ${margin.bottom}, left: ${margin.left}};
const width = ${width} - margin.left - margin.right;
const height = ${height} - margin.top - margin.bottom;

// Clear any existing visualization
d3.select("#visualization-container").selectAll("*").remove();

// Create SVG
const svg = d3.select("#visualization-container")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Set up scales
const x = d3.scaleBand()
  .range([0, width])
  .domain(data.map(d => d["${xField}"]))
  .padding(0.1);

const y = d3.scaleLinear()
  .domain([0, d3.max(data, d => +d["${yField}"])])
  .range([height, 0]);

// Add X axis
svg.append("g")
  .attr("transform", "translate(0," + height + ")")
  .call(d3.axisBottom(x))
  .selectAll("text")
  .attr("transform", "translate(-10,0)rotate(-45)")
  .style("text-anchor", "end");

// Add Y axis
svg.append("g")
  .call(d3.axisLeft(y));

// Add bars
svg.selectAll(".bar")
  .data(data)
  .enter().append("rect")
  .attr("class", "bar")
  .attr("x", d => x(d["${xField}"]))
  .attr("width", x.bandwidth())
  .attr("y", d => y(+d["${yField}"]))
  .attr("height", d => height - y(+d["${yField}"]))
  .attr("fill", "#4F46E5");

// Add title
svg.append("text")
  .attr("x", width / 2)
  .attr("y", 0 - (margin.top / 2))
  .attr("text-anchor", "middle")
  .style("font-size", "16px")
  .style("font-weight", "bold")
  .text("${requirements.title || 'Bar Chart'}");

// Add axis labels
svg.append("text")
  .attr("transform", "translate(" + (width/2) + " ," + (height + margin.bottom) + ")")
  .style("text-anchor", "middle")
  .text("${requirements.xAxis?.label || xField}");

svg.append("text")
  .attr("transform", "rotate(-90)")
  .attr("y", 0 - margin.left)
  .attr("x", 0 - (height / 2))
  .attr("dy", "1em")
  .style("text-anchor", "middle")
  .text("${requirements.yAxis?.label || yField}");

// Add tooltips if interactive
${
  requirements.interactive !== false
    ? `
const tooltip = d3.select("body").append("div")
  .attr("class", "d3-tooltip")
  .style("opacity", 0)
  .style("position", "absolute")
  .style("background", "rgba(0, 0, 0, 0.8)")
  .style("color", "white")
  .style("padding", "8px")
  .style("border-radius", "4px")
  .style("font-size", "12px");

svg.selectAll(".bar")
  .on("mouseover", function(event, d) {
    tooltip.transition().duration(200).style("opacity", .9);
    tooltip.html("${xField}: " + d["${xField}"] + "<br/>${yField}: " + d["${yField}"])
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 28) + "px");
  })
  .on("mouseout", function(d) {
    tooltip.transition().duration(500).style("opacity", 0);
  });
`
    : ''
}`;

    case 'line':
      return `
// D3.js Line Chart
const margin = {top: ${margin.top}, right: ${margin.right}, bottom: ${margin.bottom}, left: ${margin.left}};
const width = ${width} - margin.left - margin.right;
const height = ${height} - margin.top - margin.bottom;

// Clear any existing visualization
d3.select("#visualization-container").selectAll("*").remove();

// Create SVG
const svg = d3.select("#visualization-container")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Parse data
const parseTime = d3.timeParse("%Y-%m-%d");
data.forEach(d => {
  if (typeof d["${xField}"] === 'string' && d["${xField}"].match(/\\d{4}-\\d{2}-\\d{2}/)) {
    d.parsedX = parseTime(d["${xField}"]);
  } else {
    d.parsedX = +d["${xField}"];
  }
  d.parsedY = +d["${yField}"];
});

// Set up scales
const x = d.parsedX instanceof Date ? 
  d3.scaleTime().range([0, width]) :
  d3.scaleLinear().range([0, width]);
  
x.domain(d3.extent(data, d => d.parsedX));

const y = d3.scaleLinear()
  .domain([0, d3.max(data, d => d.parsedY)])
  .range([height, 0]);

// Define line
const line = d3.line()
  .x(d => x(d.parsedX))
  .y(d => y(d.parsedY));

// Add X axis
svg.append("g")
  .attr("transform", "translate(0," + height + ")")
  .call(d3.axisBottom(x));

// Add Y axis
svg.append("g")
  .call(d3.axisLeft(y));

// Add line
svg.append("path")
  .datum(data)
  .attr("fill", "none")
  .attr("stroke", "#4F46E5")
  .attr("stroke-width", 2)
  .attr("d", line);

// Add dots
svg.selectAll(".dot")
  .data(data)
  .enter().append("circle")
  .attr("class", "dot")
  .attr("cx", d => x(d.parsedX))
  .attr("cy", d => y(d.parsedY))
  .attr("r", 4)
  .attr("fill", "#4F46E5");

// Add title
svg.append("text")
  .attr("x", width / 2)
  .attr("y", 0 - (margin.top / 2))
  .attr("text-anchor", "middle")
  .style("font-size", "16px")
  .style("font-weight", "bold")
  .text("${requirements.title || 'Line Chart'}");`;

    case 'pie':
      return `
// D3.js Pie Chart
const width = ${width};
const height = ${height};
const radius = Math.min(width, height) / 2 - 40;

// Clear any existing visualization
d3.select("#visualization-container").selectAll("*").remove();

// Create SVG
const svg = d3.select("#visualization-container")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .append("g")
  .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

// Set up pie layout
const pie = d3.pie()
  .value(d => +d["${yField}"]);

const arc = d3.arc()
  .innerRadius(0)
  .outerRadius(radius);

// Color scale
const color = d3.scaleOrdinal(d3.schemeCategory10);

// Build arcs
const arcs = svg.selectAll(".arc")
  .data(pie(data))
  .enter().append("g")
  .attr("class", "arc");

arcs.append("path")
  .attr("d", arc)
  .attr("fill", (d, i) => color(i));

// Add labels
arcs.append("text")
  .attr("transform", d => "translate(" + arc.centroid(d) + ")")
  .attr("text-anchor", "middle")
  .text(d => d.data["${xField}"]);`;

    default:
      // Auto-detect best visualization type
      return generateD3Template('bar', data, requirements);
  }
}

/**
 * Main function to create D3 visualization
 */
export async function createD3Visualization(
  request: VisualizationRequest,
): Promise<D3VisualizationResponse> {
  try {
    // Validate input
    if (!request.data || !Array.isArray(request.data) || request.data.length === 0) {
      throw new Error('Valid data array is required');
    }

    // Determine visualization type
    let visualizationType = request.type || 'auto';

    if (visualizationType === 'auto') {
      // Auto-detect based on data structure
      const fields = Object.keys(request.data[0]);
      const hasNumeric = fields.some((f) => typeof request.data[0][f] === 'number');
      const hasDate = fields.some(
        (f) =>
          typeof request.data[0][f] === 'string' && request.data[0][f].match(/\d{4}-\d{2}-\d{2}/),
      );

      if (hasDate && hasNumeric) {
        visualizationType = 'line';
      } else if (fields.length === 2 && hasNumeric) {
        visualizationType = 'bar';
      } else if (fields.length >= 3) {
        visualizationType = 'scatter';
      } else {
        visualizationType = 'bar';
      }
    }

    // Generate D3 code
    const code = await generateD3CodeWithAI(request.data, visualizationType, request);

    // Prepare response
    const response: D3VisualizationResponse = {
      code: code,
      dependencies: ['https://d3js.org/d3.v7.min.js'],
      containerRequirements: {
        id: 'visualization-container',
        width: request.width || 800,
        height: request.height || 600,
      },
      dataFormat: 'json',
      instructions: `
1. Include D3.js v7 in your HTML: <script src="https://d3js.org/d3.v7.min.js"></script>
2. Create a container div: <div id="visualization-container"></div>
3. Ensure your data is available in a variable called 'data'
4. Execute the provided D3 code after the DOM is loaded
5. The visualization will render in the container div
      `.trim(),
    };

    return response;
  } catch (error: any) {
    throw new Error(`Failed to create D3 visualization: ${error.message}`);
  }
}

/**
 * Generate D3 code from natural language description
 */
export async function generateD3FromDescription(
  description: string,
  data?: any[],
): Promise<D3VisualizationResponse> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  const prompt = `Based on this description, determine the best D3.js visualization parameters:
"${description}"

${data ? `Sample data: ${JSON.stringify(data.slice(0, 3), null, 2)}` : ''}

Extract and return a JSON object with:
- type: the visualization type (bar, line, pie, scatter, etc.)
- title: a title for the chart
- xAxis: {label, field}
- yAxis: {label, field}
- any other relevant parameters

Return ONLY the JSON object, no explanations.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      temperature: 0,
      system: 'Extract visualization parameters from descriptions. Return only valid JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText =
      response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
    const params = JSON.parse(responseText);

    // Create visualization request
    const request: VisualizationRequest = {
      data: data || [],
      type: params.type || 'auto',
      title: params.title,
      xAxis: params.xAxis,
      yAxis: params.yAxis,
      ...params,
    };

    return createD3Visualization(request);
  } catch (error: any) {
    throw new Error(`Failed to generate D3 from description: ${error.message}`);
  }
}
