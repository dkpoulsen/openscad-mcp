# OpenSCAD MCP Server

A Model Context Protocol (MCP) server for OpenSCAD - enables AI assistants to create and manipulate 3D CAD models.

## Features

- **Render**: Compile OpenSCAD code to 3D mesh formats (STL, OFF, AMF, 3MF, CSG)
- **Preview**: Generate 2D previews (PNG, SVG, DXF, PDF) with camera controls
- **Validate**: Check OpenSCAD syntax without generating output
- **Info**: Get OpenSCAD installation information

## Prerequisites

- Node.js 18 or higher
- [OpenSCAD](https://openscad.org/) installed on your system

## Installation

```bash
# Clone or download this repository
cd openscad-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "openscad": {
      "command": "node",
      "args": ["/path/to/openscad-mcp/dist/index.js"]
    }
  }
}
```

## Tools

### render

Compile OpenSCAD code to a 3D mesh format.

**Parameters:**
- `scad` (string, required): OpenSCAD code to compile
- `format` (string, default: "stl"): Output format - `stl`, `off`, `amf`, `3mf`, or `csg`
- `parameters` (object, optional): Variables to pass via -D flags
- `exportFormat` (string, optional): For STL - `asciistl` or `binstl`
- `hardwarnings` (boolean, default: true): Treat warnings as errors

### preview

Generate a 2D preview or vector export.

**Parameters:**
- `scad` (string, required): OpenSCAD code to preview
- `format` (string, default: "png"): Output format - `png`, `svg`, `dxf`, or `pdf`
- `width` (number, default: 800): Image width in pixels
- `height` (number, default: 600): Image height in pixels
- `camera` (string, optional): Camera position
- `colorscheme` (string, default: "Cornfield"): Color scheme
- `projection` (string, default: "perspective"): `ortho` or `perspective`
- `autocenter` (boolean, default: true): Center the design
- `viewall` (boolean, default: true): Fit entire design in view
- `render` (boolean, default: false): Use full CGAL render

### validate

Validate OpenSCAD syntax.

**Parameters:**
- `scad` (string, required): OpenSCAD code to validate
- `parameters` (object, optional): Variables to define

### info

Get OpenSCAD installation information.

## Example Usage with AI Assistant

```
User: Create a simple 10x10x10 cube in OpenSCAD and render it to STL

AI: I'll create a cube and render it for you.

[Uses render tool with:]
scad: cube([10, 10, 10]);
format: stl
```

## Color Schemes

Available color schemes for PNG export:
- Cornfield (default)
- Metallic
- Sunset
- Starnight
- BeforeDawn
- Nature
- Daylight Gem
- Nocturnal Gem
- DeepOcean
- Solarized
- Tomorrow
- Tomorrow Night
- ClearSky
- Monotone

## License

MIT
