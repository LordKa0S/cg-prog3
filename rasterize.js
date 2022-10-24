/* eslint-disable no-undef */

//#region Type def

/**
 * @typedef {[number, number, number]} vec3
 */

/**
 * @typedef {Object} Illuminator
 * @property {vec3} ambient
 * @property {vec3} diffuse
 * @property {vec3} specular
 */

/**
 * @typedef {Object} Surface
 * @property {number} n
 */

/**
 * @typedef {Object} TriangleSet
 * @property {Illuminator & Surface} material
 * @property {Array<vec3>} vertices
 * @property {Array<vec3>} normals
 * @property {Array<vec3>} triangles
 */

//#endregion

const CANVAS_DEFAULT_SCALE = 6;
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog3/triangles.json"; // triangles file loc

/**
 * Start here
 * @returns 
 */
const main = async () => {
    const windowWidth = 1;
    const windowHeight = 1;
    const gl = getCanvasContext(windowWidth, windowHeight);

    // If we don't have a GL context, give up now

    if (!gl) {
        alert(
            "Unable to initialize WebGL. Your browser or machine may not support it."
        );
        return;
    }

    /**
     * Vertex shader program
     */

    const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying lowp vec4 vColor;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vColor = aVertexColor;
    }
  `;

    /**
     * Fragment shader program
     */

    const fsSource = `
    varying lowp vec4 vColor;

    void main(void) {
      gl_FragColor = vColor;
    }
  `;


    // Initialize a shader program; this is where all the lighting
    // for the vertices and so forth is established.
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    // Collect all the info needed to use the shader program.
    // Look up which attributes our shader program is using
    // for aVertexPosition, aVertexColor and also
    // look up uniform locations.
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(
                shaderProgram,
                "uProjectionMatrix"
            ),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
        },
    };

    const triangleSets = await getInputObjects(INPUT_TRIANGLES_URL);


    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clearDepth(1.0); // Clear everything

    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    const buffers = initBuffers(gl, triangleSets);

    // Draw the scene
    requestAnimationFrame(() => render(gl, programInfo, buffers, triangleSets.reduce(
        (prevSum, triangleSet) => prevSum + (triangleSet.triangles.length * 3),
        0
    )));
};

const render = (gl, programInfo, buffers, vertexCount) => {
    drawScene(gl, programInfo, buffers, vertexCount);
};

/**
 * @param {?number} windowWidth
 * @param {?number} windowHeight
 * @returns {CanvasRenderingContext2D} The context for the first canvas in the document
 */
const getCanvasContext = (windowWidth, windowHeight) => {
    let canvas = document.getElementsByTagName("canvas").item(0);
    if (canvas === null) {
        canvas = document.createElement("canvas");
        document.body.appendChild(canvas);
        const ratio = windowWidth / windowHeight;
        canvas.height *= CANVAS_DEFAULT_SCALE;
        canvas.width = canvas.height * ratio;
    }
    return canvas.getContext("webgl2");
};

/**
 * get the input boxex from the specified URL
 * @param {URL} url URL to fetch the boxes from
 * @returns {Promise<Array<TriangleSet>} All box objects specified in the url
 */
const getInputObjects = async (url) => {
    const response = await fetch(url);
    return await response.json();
};


/**
 * Initialize the buffers we'll need
 * @param {WebGL2RenderingContext} gl 
 * @param {Array<TriangleSet>} triangleSets
 * @returns 
 */
const initBuffers = (gl, triangleSets) => {
    // Create a buffer for the cube's vertex positions.

    const positionBuffer = gl.createBuffer();

    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    /**
     * an array of positions
     */
    const positions = triangleSets.map(triangleSet => triangleSet.vertices.flat()).flat();

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Convert the array of colors into a table for all the vertices.

    const colors = triangleSets.map(triangleSet => triangleSet.vertices.map(() => [...triangleSet.material.diffuse, 1.0]).flat()).flat();

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    // Build the element array buffer; this specifies the indices
    // into the vertex arrays for each face's vertices.

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    // This array defines each face as two triangles, using the
    // indices into the vertex array to specify each triangle's
    // position.

    let offset = 0;

    const indices = triangleSets.map(triangleSet => {
        const prev = offset;
        offset += triangleSet.vertices.length;
        return triangleSet.triangles.flat().map(val => val + prev);
    }).flat();

    // Now send the element array to GL

    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(indices),
        gl.STATIC_DRAW
    );

    return {
        position: positionBuffer,
        color: colorBuffer,
        indices: indexBuffer,
    };
};

/**
 * Draw the scene.
 * @param {WebGL2RenderingContext} gl 
 * @param {*} programInfo 
 * @param {Object.<string, WebGLBuffer | null>} buffers 
 * @param {number} vertexCount
 */
const drawScene = (gl, programInfo, buffers, vertexCount) => {
    const eye = [0.5, 0.5, -0.5];
    const center = [0.5, 0.5, 0];
    const up = [0, 1, 0];

    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // Our field of view is 90 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.

    const fieldOfView = (90 * Math.PI) / 180; // in radians
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0;
    const zFar = 1;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);

    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    const modelViewMatrix = mat4.create();

    // Now move the drawing position a bit to where we want to
    // start drawing the square.

    mat4.lookAt(modelViewMatrix, eye, center, up);


    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    // Tell WebGL how to pull out the colors from the color buffer
    // into the vertexColor attribute.
    {
        const numComponents = 4;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexColor,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
    }

    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

    // Tell WebGL to use our program when drawing

    gl.useProgram(programInfo.program);

    // Set the shader uniforms

    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix
    );
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelViewMatrix,
        false,
        modelViewMatrix
    );

    {
        const type = gl.UNSIGNED_SHORT;
        const offset = 0;
        gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
    }
};

/**
 * Initialize a shader program, so WebGL knows how to draw our data
 * @param {WebGL2RenderingContext} gl 
 * @param {string} vsSource 
 * @param {string} fsSource 
 * @returns 
 */
const initShaderProgram = (gl, vsSource, fsSource) => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            "Unable to initialize the shader program: " +
            gl.getProgramInfoLog(shaderProgram)
        );
        return null;
    }

    return shaderProgram;
};

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
/**
 * 
 * @param {WebGL2RenderingContext} gl 
 * @param {number} type 
 * @param {string} source 
 * @returns 
 */
const loadShader = (gl, type, source) => {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
};

window.onload = main;