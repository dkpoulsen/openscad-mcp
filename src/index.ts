#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Supported export formats
const EXPORT_FORMATS_3D = ['stl', 'off', 'amf', '3mf', 'csg'] as const;
const EXPORT_FORMATS_2D = ['dxf', 'svg', 'pdf'] as const;
const EXPORT_FORMATS_IMAGE = ['png'] as const;

// Color schemes for PNG export
const COLOR_SCHEMES = [
  'Cornfield', 'Metallic', 'Sunset', 'Starnight', 'BeforeDawn',
  'Nature', 'Daylight Gem', 'Nocturnal Gem', 'DeepOcean',
  'Solarized', 'Tomorrow', 'Tomorrow Night', 'ClearSky', 'Monotone'
] as const;

// Create temp directory for our files
const TEMP_DIR = join(tmpdir(), 'openscad-mcp');

async function ensureTempDir() {
  try {
    await mkdir(TEMP_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

async function findOpenSCAD(): Promise<string> {
  // Common paths to check
  const candidates = [
    'openscad',
    '/usr/bin/openscad',
    '/usr/local/bin/openscad',
    '/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD',
    'C:\\Program Files\\OpenSCAD\\openscad.exe',
    'C:\\Program Files (x86)\\OpenSCAD\\openscad.exe',
  ];

  for (const candidate of candidates) {
    try {
      const result = await runCommand(candidate, ['--version']);
      if (result.code === 0) return candidate;
    } catch {
      // Try next candidate
    }
  }

  return 'openscad'; // Default to PATH lookup
}

function runCommand(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { shell: false });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    proc.on('error', (err) => {
      resolve({ code: 1, stdout: '', stderr: err.message });
    });
  });
}

interface OpenSCADOptions {
  format?: string;
  parameters?: Record<string, string | number | boolean>;
  render?: boolean;
  camera?: string;
  imgsize?: string;
  colorscheme?: string;
  projection?: 'ortho' | 'perspective';
  autocenter?: boolean;
  viewall?: boolean;
  exportFormat?: 'asciistl' | 'binstl';
  quiet?: boolean;
  hardwarnings?: boolean;
}

async function runOpenSCAD(
  scadCode: string,
  outputPath: string,
  options: OpenSCADOptions = {}
): Promise<{ success: boolean; error?: string; output?: string }> {
  await ensureTempDir();

  const id = randomUUID();
  const inputPath = join(TEMP_DIR, `input-${id}.scad`);

  try {
    // Write SCAD code to temp file
    await writeFile(inputPath, scadCode, 'utf-8');

    const openscadPath = await findOpenSCAD();
    const args: string[] = ['-o', outputPath];

    // Add render flag for 3D exports
    if (options.render !== false && !outputPath.endsWith('.png')) {
      args.push('--render');
    }

    // Add parameters
    if (options.parameters) {
      for (const [key, value] of Object.entries(options.parameters)) {
        if (typeof value === 'string') {
          args.push('-D', `${key}="${value}"`);
        } else if (typeof value === 'boolean') {
          args.push('-D', `${key}=${value}`);
        } else {
          args.push('-D', `${key}=${value}`);
        }
      }
    }

    // Add camera settings
    if (options.camera) {
      args.push('--camera', options.camera);
    }

    // Add image size
    if (options.imgsize) {
      args.push('--imgsize', options.imgsize);
    }

    // Add colorscheme
    if (options.colorscheme) {
      args.push('--colorscheme', options.colorscheme);
    }

    // Add projection
    if (options.projection) {
      args.push('--projection', options.projection);
    }

    // Add autocenter
    if (options.autocenter) {
      args.push('--autocenter');
    }

    // Add viewall
    if (options.viewall) {
      args.push('--viewall');
    }

    // Add export format override
    if (options.exportFormat) {
      args.push('--export-format', options.exportFormat);
    }

    // Add quiet
    if (options.quiet !== false) {
      args.push('-q');
    }

    // Add hardwarnings
    if (options.hardwarnings) {
      args.push('--hardwarnings');
    }

    // Add input file
    args.push(inputPath);

    const result = await runCommand(openscadPath, args);

    if (result.code !== 0) {
      return {
        success: false,
        error: result.stderr || `OpenSCAD exited with code ${result.code}`,
        output: result.stdout
      };
    }

    return { success: true, output: result.stdout };
  } finally {
    // Cleanup temp file
    try {
      await unlink(inputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Create the MCP server
const server = new McpServer({
  name: 'openscad-mcp',
  version: '1.0.0',
});

// Tool: Render SCAD to 3D format
server.registerTool(
  'render',
  {
    description: 'Compile OpenSCAD code to a 3D mesh format (STL, OFF, AMF, 3MF, or CSG). Use this to generate 3D-printable files.',
    inputSchema: z.object({
      scad: z.string().describe('OpenSCAD code to compile'),
      format: z.enum(EXPORT_FORMATS_3D).default('stl').describe('Output format for the 3D mesh'),
      parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
        .describe('Variables to pass to OpenSCAD via -D flags (e.g., {width: 10, name: "test"})'),
      exportFormat: z.enum(['asciistl', 'binstl']).optional()
        .describe('For STL: "asciistl" for ASCII format, "binstl" for binary (smaller file)'),
      hardwarnings: z.boolean().optional().default(true)
        .describe('Treat warnings as errors'),
    }),
  },
  async ({ scad, format, parameters, exportFormat, hardwarnings }) => {
    await ensureTempDir();
    const id = randomUUID();
    const outputPath = join(TEMP_DIR, `output-${id}.${format}`);

    try {
      const result = await runOpenSCAD(scad, outputPath, {
        format,
        parameters,
        render: true,
        exportFormat,
        hardwarnings,
      });

      if (!result.success) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error rendering OpenSCAD code:\n${result.error}`,
          }],
          isError: true,
        };
      }

      // Read the output file
      const outputData = await readFile(outputPath);
      const base64 = outputData.toString('base64');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully compiled OpenSCAD to ${format.toUpperCase()} format.`,
          },
          {
            type: 'resource' as const,
            resource: {
              uri: `openscad://output.${format}`,
              mimeType: getMimeType(format),
              text: base64,
            },
          },
        ],
      };
    } finally {
      // Cleanup output file
      try {
        await unlink(outputPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
);

// Tool: Preview (2D/image export)
server.registerTool(
  'preview',
  {
    description: 'Generate a 2D preview of OpenSCAD code. Export as PNG image or vector formats (SVG, DXF, PDF). Use camera settings to control the view.',
    inputSchema: z.object({
      scad: z.string().describe('OpenSCAD code to preview'),
      format: z.enum([...EXPORT_FORMATS_2D, ...EXPORT_FORMATS_IMAGE]).default('png')
        .describe('Output format: png (image), svg/dxf/pdf (2D vector)'),
      parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
        .describe('Variables to pass to OpenSCAD'),
      width: z.number().optional().default(800)
        .describe('Image width in pixels (for PNG)'),
      height: z.number().optional().default(600)
        .describe('Image height in pixels (for PNG)'),
      camera: z.string().optional()
        .describe('Camera position: "tx,ty,tz,rx,ry,rz,dist" (gimbal) or "ex,ey,ez,cx,cy,cz" (look-at)'),
      colorscheme: z.enum(COLOR_SCHEMES).optional().default('Cornfield')
        .describe('Color scheme for rendering'),
      projection: z.enum(['ortho', 'perspective']).optional().default('perspective')
        .describe('Projection type'),
      autocenter: z.boolean().optional().default(true)
        .describe('Center the design in the view'),
      viewall: z.boolean().optional().default(true)
        .describe('Adjust camera to fit entire design'),
      render: z.boolean().optional().default(false)
        .describe('Use full CGAL render instead of preview (slower but more accurate)'),
    }),
  },
  async ({ scad, format, parameters, width, height, camera, colorscheme, projection, autocenter, viewall, render }) => {
    await ensureTempDir();
    const id = randomUUID();
    const outputPath = join(TEMP_DIR, `preview-${id}.${format}`);

    try {
      const result = await runOpenSCAD(scad, outputPath, {
        format,
        parameters: parameters as Record<string, string | number | boolean> | undefined,
        render,
        camera,
        imgsize: `${width},${height}`,
        colorscheme,
        projection,
        autocenter,
        viewall,
      });

      if (!result.success) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error generating preview:\n${result.error}`,
          }],
          isError: true,
        };
      }

      const outputData = await readFile(outputPath);
      const base64 = outputData.toString('base64');

      return {
          content: [{
            type: 'text' as const,
            text: `Preview generated successfully in ${format.toUpperCase()} format.`,
          },
          {
            type: 'resource' as const,
            resource: {
              uri: `openscad://preview.${format}`,
              mimeType: getMimeType(format),
              text: base64,
            },
          },
        ],
      };
    } finally {
      try {
        await unlink(outputPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
);

// Tool: Validate SCAD code
server.registerTool(
  'validate',
  {
    description: 'Validate OpenSCAD code syntax without generating output. Returns errors and warnings if any.',
    inputSchema: z.object({
      scad: z.string().describe('OpenSCAD code to validate'),
      parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
        .describe('Variables to define during validation'),
    }),
  },
  async ({ scad, parameters }) => {
    await ensureTempDir();
    const id = randomUUID();
    const inputPath = join(TEMP_DIR, `validate-${id}.scad`);

    try {
      await writeFile(inputPath, scad, 'utf-8');

      const openscadPath = await findOpenSCAD();
      const args: string[] = ['-o', '/dev/null', '--hardwarnings'];

      if (parameters) {
        for (const [key, value] of Object.entries(parameters)) {
          if (typeof value === 'string') {
            args.push('-D', `${key}="${value}"`);
          } else if (typeof value === 'boolean') {
            args.push('-D', `${key}=${value}`);
          } else {
            args.push('-D', `${key}=${value}`);
          }
        }
      }

      args.push(inputPath);

      const result = await runCommand(openscadPath, args);

      if (result.code !== 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `Validation failed:\n${result.stderr || result.stdout}`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: 'OpenSCAD code is valid. No syntax errors found.',
        }],
      };
    } finally {
      try {
        await unlink(inputPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
);

// Tool: Get OpenSCAD info
server.registerTool(
  'info',
  {
    description: 'Get information about the OpenSCAD installation (version, features, library versions).',
    inputSchema: z.object({}),
  },
  async () => {
    const openscadPath = await findOpenSCAD();
    const versionResult = await runCommand(openscadPath, ['--version']);
    const infoResult = await runCommand(openscadPath, ['--info']);

    if (versionResult.code !== 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `OpenSCAD not found or not working. Please install OpenSCAD.\nError: ${versionResult.stderr}`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: `OpenSCAD Installation Info:\n\nVersion:\n${versionResult.stdout}\n\nBuild Info:\n${infoResult.stdout}`,
      }],
    };
  }
);

// Resource: SCAD code template
server.registerResource(
  'template',
  'openscad://template.scad',
  {
    description: 'OpenSCAD code template with common patterns',
    mimeType: 'text/plain',
  },
  async () => ({
    contents: [{
      uri: 'openscad://template.scad',
      text: `// OpenSCAD Template
// Parameters (customizable via MCP)
width = 10;
height = 20;
depth = 5;

// Main geometry
difference() {
    // Outer shape
    cube([width, height, depth], center=true);
    
    // Inner cutout
    cylinder(h=depth+2, r=width/3, center=true, $fn=32);
}

// Example modules
module rounded_box(size, radius) {
    hull() {
        for (x = [-1, 1], y = [-1, 1]) {
            translate([x * (size.x/2 - radius), y * (size.y/2 - radius), 0])
                cylinder(r=radius, h=size.z, center=true);
        }
    }
}
`,
    }],
  })
);

function getMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    stl: 'model/stl',
    off: 'model/off',
    amf: 'model/amf',
    '3mf': 'model/3mf',
    csg: 'text/plain',
    dxf: 'image/vnd.dxf',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    png: 'image/png',
  };
  return mimeTypes[format] || 'application/octet-stream';
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenSCAD MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
