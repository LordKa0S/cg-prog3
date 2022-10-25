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

const eye = [0.5, 0.5, -0.5];
const up = [0, 1, 0];
const at = [0, 0, 1];
/**
 * @type {}
 */
const selectionMatrices = [];
/**
 * @type {Array<TriangleSet>}
 */
const triangleSets = [];
let selectedSet = -1;

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
    precision mediump float;

    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    attribute mat4 aSelectionMatrix;
    attribute vec4 aNormal;
    attribute vec4 eye;
    
    attribute vec4 aAmbient;
    attribute vec4 aDiffuse;
    attribute vec4 aSpecular;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform vec4 uLightPos;

    varying lowp vec4 vColor;
    varying vec4 vL;
    varying vec4 vN;
    varying vec4 vE;
    varying vec4 f_aDiffuse;
    varying vec4 f_ambient;
    varying vec4 f_specular;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aSelectionMatrix * aVertexPosition;
      vColor = aVertexColor;
      vec4 lightPos = uModelViewMatrix * uLightPos;
      vL = normalize(lightPos - aVertexPosition);
      vN = normalize(aNormal);
      vE = normalize(eye - aVertexPosition);
      f_aDiffuse = aDiffuse;
      f_ambient = aAmbient;
      f_specular = aSpecular;

      
    }
  `;

    /**
     * Fragment shader program
     */

    const fsSource = `
    precision mediump float;

    varying vec4 vColor;
    varying vec4 vL;
    varying vec4 vN;
    varying vec4 vE;
    varying vec4 f_aDiffuse;
    varying vec4 f_ambient;
    varying vec4 f_specular;

    void main(void) {
        vec3 VE = vec3(vE[0],vE[1],vE[2]);
        vec3 VL = vec3(vL[0],vL[1],vL[2]);
        vec3 VN = vec3(vN[0],vN[1],vN[2]);
        vec3 rgb = vec3(0,0,0);
        vec3 hVect = normalize(VE + VL);
        float nDotL = dot(VN, VL);
        float nDotH = dot(VN, hVect);
        for (int colorIndex = 0; colorIndex < 3; colorIndex++) {
            float colAmb = max(0.0,f_ambient[colorIndex]);
            float colDif = f_aDiffuse[colorIndex] * max(nDotL, 0.0);
            float colSpec = max(0.0, f_specular[colorIndex] * pow(max(nDotH, 0.0), 17.0));
            rgb[colorIndex] = colAmb + colDif + colSpec;
        }

        gl_FragColor = vec4(rgb[0],rgb[1],rgb[2],1.0);
      
    //   float diffuse = max(dot(vL, vN), 0.0);
    //   vec4 H = normalize(vL + vE);
    //   float abc = dot(vN,H);
    //   float ambient_comp = max(0.0,f_ambient[0]);
    //   float specular = pow(abc,1.0);
    // //   if (dot(vL, vN) < 0.0)
    // //     specular = vec4(0.0, 0.0, 0.0, 1.0);
    //   float fColor = ambient_comp + diffuse + specular;
      
      
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
            selectionMatrix: gl.getAttribLocation(shaderProgram, "aSelectionMatrix"),
            normal: gl.getAttribLocation(shaderProgram, "aNormal"),
            ambient: gl.getAttribLocation(shaderProgram, "aAmbient"),
            diffuse: gl.getAttribLocation(shaderProgram, "aDiffuse"),
            specular: gl.getAttribLocation(shaderProgram, "aSpecular"),
            eye: gl.getAttribLocation(shaderProgram, "eye"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(
                shaderProgram,
                "uProjectionMatrix"
            ),
            lightPos: gl.getUniformLocation(
                shaderProgram,
                "uLightPos"
            ),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, "uModelViewMatrix"),
        },
    };

    await initValuesFromApi();

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

const initValuesFromApi = async () => {
    if (triangleSets.length === 0) {
        triangleSets.push(...await getInputObjects(INPUT_TRIANGLES_URL));
        triangleSets.forEach(() => selectionMatrices.push(mat4.create()));
    }
};

const render = (gl, programInfo, buffers, vertexCount) => {
    drawScene(gl, programInfo, buffers, vertexCount, eye, at, up);
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

    // Build the selection matrices buffer
    const selectionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, selectionBuffer);
    const selectionBufferData = [];
    triangleSets.forEach((triangleSet, setIndex) => {
        triangleSet.triangles.forEach(() => {
            selectionBufferData.push.apply(selectionBufferData, selectionMatrices[setIndex]);
            selectionBufferData.push.apply(selectionBufferData, selectionMatrices[setIndex]);
            selectionBufferData.push.apply(selectionBufferData, selectionMatrices[setIndex]);
        });
    });
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(selectionBufferData), gl.STATIC_DRAW);

    // Build the normals buffer
    const normals = [];
    const normalBuffer = gl.createBuffer();
    triangleSets.forEach(triangleSet => {
        triangleSet.triangles.forEach((vertex) => {
            normals.push.apply(normals, triangleSet.normals[vertex]);
        });
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    // Build the ambient buffer
    const ambients = triangleSets.map(triangleSet => triangleSet.vertices.map(() => [...triangleSet.material.ambient, 1.0]).flat()).flat();

    const ambientBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ambientBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ambients), gl.STATIC_DRAW);

    // Build the diffuse buffer
    const diffuses = triangleSets.map(triangleSet => triangleSet.vertices.map(() => [...triangleSet.material.diffuse, 1.0]).flat()).flat();

    const diffuseBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, diffuseBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(diffuses), gl.STATIC_DRAW);

    // Build the specular buffer
    const speculars = triangleSets.map(triangleSet => triangleSet.vertices.map(() => [...triangleSet.material.specular, 1.0]).flat()).flat();

    const specularBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, specularBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(speculars), gl.STATIC_DRAW);

    const eyes = triangleSets.map(triangleSet => triangleSet.vertices.map(() => [eye, 1.0]).flat()).flat();

    const eyeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, eyeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(eyes), gl.STATIC_DRAW);

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
        selection: selectionBuffer,
        normal: normalBuffer,
        ambient: ambientBuffer,
        diffuse: diffuseBuffer,
        specular: specularBuffer,
        eye: eyeBuffer,
    };
};

/**
 * Draw the scene.
 * @param {WebGL2RenderingContext} gl 
 * @param {*} programInfo 
 * @param {Object.<string, WebGLBuffer | null>} buffers 
 * @param {number} vertexCount
 */
const drawScene = (gl, programInfo, buffers, vertexCount, eye, at, up) => {
    const center = vec3.create();
    vec3.add(center, eye, at);

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

    const lightPos = [-0.5, 1.5, -0.5];

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

    // Tell WebGL how to pull out the transformations from the selectionMatrix buffer
    // into the selectionMatrix attribute.
    {
        const numComponents = 4;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 64;
        const offset = 16;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.selection);
        for (let offsetIdx = 0; offsetIdx < 4; offsetIdx++) {
            gl.vertexAttribPointer(
                programInfo.attribLocations.selectionMatrix + offsetIdx,
                numComponents,
                type,
                normalize,
                stride,
                offsetIdx * offset,
            );
            gl.enableVertexAttribArray(programInfo.attribLocations.selectionMatrix + offsetIdx);
        }
    }

    // Tell WebGL how to pull out the transformations from the normal buffer
    // into the normal attribute.
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normal);
        gl.vertexAttribPointer(
            programInfo.attribLocations.normal,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.normal);
    }

    // Tell WebGL how to pull out the transformations from the ambient buffer
    // into the ambient attribute.
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.ambient);
        gl.vertexAttribPointer(
            programInfo.attribLocations.ambient,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.ambient);
    }

    // Tell WebGL how to pull out the transformations from the ambient buffer
    // into the ambient attribute.
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.eye);
        gl.vertexAttribPointer(
            programInfo.attribLocations.eye,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.eye);
    }

    // Tell WebGL how to pull out the transformations from the diffuse buffer
    // into the diffuse attribute.
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.diffuse);
        gl.vertexAttribPointer(
            programInfo.attribLocations.diffuse,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.diffuse);
    }

    // Tell WebGL how to pull out the transformations from the specular buffer
    // into the specular attribute.
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.specular);
        gl.vertexAttribPointer(
            programInfo.attribLocations.specular,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.specular);
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
        programInfo.uniformLocations.lightPos,
        false,
        lightPos
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

/**
 * 
 * @param {TriangleSet} triangleSet 
 */
const getCenter = (triangleSet) => {
    const factor = triangleSet.triangles.length * 3;
    const result = [0, 0, 0];
    for (const triangle of triangleSet.triangles) {
        for (const vertex of triangle) {
            const [x, y, z] = triangleSet.vertices[vertex];
            result[0] += x / factor;
            result[1] += y / factor;
            result[2] += z / factor;
        }
    }
    return result;
};

/**
 * 
 * @param {KeyboardEvent} event 
 */
const keyHandler = (event) => {
    event.preventDefault();
    const changeBy = 0.5;
    if (event.key === "a") {
        eye[0] += changeBy;
    } else if (event.key === "d") {
        eye[0] -= changeBy;
    } else if (event.key === "w") {
        eye[2] += changeBy;
    } else if (event.key === "s") {
        eye[2] -= changeBy;
    } else if (event.key === "q") {
        eye[1] += changeBy;
    } else if (event.key === "e") {
        eye[1] -= changeBy;
    } else if (event.key === "A") {
        vec3.rotateY(at, at, eye, glMatrix.toRadian(changeBy));
    } else if (event.key === "D") {
        vec3.rotateY(at, at, eye, -glMatrix.toRadian(changeBy));
    } else if (event.key === "W") {
        vec3.rotateX(at, at, eye, glMatrix.toRadian(changeBy));
        vec3.rotateX(up, up, eye, glMatrix.toRadian(changeBy));
    } else if (event.key === "S") {
        vec3.rotateX(at, at, eye, -glMatrix.toRadian(changeBy));
        vec3.rotateX(up, up, eye, -glMatrix.toRadian(changeBy));
    } else if (event.key === " ") {
        if (selectedSet !== -1) {
            const scale = 1 / 1.2;
            const v = [scale, scale, 1];
            mat4.scale(selectionMatrices[selectedSet], selectionMatrices[selectedSet], v);
            selectedSet = -1;
        }
    } else if (event.key === "ArrowLeft") {
        if (selectedSet !== -1) {
            const scale = 1 / 1.2;
            const v = [scale, scale, 1];
            mat4.scale(selectionMatrices[selectedSet], selectionMatrices[selectedSet], v);
        }
        selectedSet--;
        if (selectedSet < 0) {
            selectedSet = selectionMatrices.length - 1;
        }
        const scale = 1.2;
        const v = [scale, scale, 1];
        mat4.scale(selectionMatrices[selectedSet], selectionMatrices[selectedSet], v);
    } else if (event.key === "ArrowRight") {
        if (selectedSet !== -1) {
            const scale = 1 / 1.2;
            const v = [scale, scale, 1];
            mat4.scale(selectionMatrices[selectedSet], selectionMatrices[selectedSet], v);
        }
        selectedSet++;
        if (selectedSet > selectionMatrices.length - 1) {
            selectedSet = 0;
        }
        const scale = 1.2;
        const v = [scale, scale, 1];
        mat4.scale(selectionMatrices[selectedSet], selectionMatrices[selectedSet], v);
    } else if (event.key === "k") {
        if (selectedSet !== -1) {
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], [changeBy, 0, 0]);
        }
    } else if (event.key === ";") {
        if (selectedSet !== -1) {
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], [-changeBy, 0, 0]);
        }
    } else if (event.key === "o") {
        if (selectedSet !== -1) {
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], [0, 0, changeBy]);
        }
    } else if (event.key === "l") {
        if (selectedSet !== -1) {
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], [0, 0, -changeBy]);
        }
    } else if (event.key === "i") {
        if (selectedSet !== -1) {
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], [0, changeBy, 0]);
        }
    } else if (event.key === "p") {
        if (selectedSet !== -1) {
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], [0, -changeBy, 0]);
        }
    } else if (event.key === "K") {
        if (selectedSet !== -1) {
            const center = getCenter(triangleSets[selectedSet]);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], center);
            mat4.rotateY(selectionMatrices[selectedSet], selectionMatrices[selectedSet], changeBy);
            const reverse = center.map(val => -val);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], reverse);
        }
    } else if (event.key === ":") {
        if (selectedSet !== -1) {
            const center = getCenter(triangleSets[selectedSet]);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], center);
            mat4.rotateY(selectionMatrices[selectedSet], selectionMatrices[selectedSet], -changeBy);
            const reverse = center.map(val => -val);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], reverse);
        }
    } else if (event.key === "O") {
        if (selectedSet !== -1) {
            const center = getCenter(triangleSets[selectedSet]);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], center);
            mat4.rotateX(selectionMatrices[selectedSet], selectionMatrices[selectedSet], changeBy);
            const reverse = center.map(val => -val);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], reverse);
        }
    } else if (event.key === "L") {
        if (selectedSet !== -1) {
            const center = getCenter(triangleSets[selectedSet]);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], center);
            mat4.rotateX(selectionMatrices[selectedSet], selectionMatrices[selectedSet], -changeBy);
            const reverse = center.map(val => -val);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], reverse);
        }
    } else if (event.key === "I") {
        if (selectedSet !== -1) {
            const center = getCenter(triangleSets[selectedSet]);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], center);
            mat4.rotateZ(selectionMatrices[selectedSet], selectionMatrices[selectedSet], changeBy);
            const reverse = center.map(val => -val);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], reverse);
        }
    } else if (event.key === "P") {
        if (selectedSet !== -1) {
            const center = getCenter(triangleSets[selectedSet]);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], center);
            mat4.rotateZ(selectionMatrices[selectedSet], selectionMatrices[selectedSet], -changeBy);
            const reverse = center.map(val => -val);
            mat4.translate(selectionMatrices[selectedSet], selectionMatrices[selectedSet], reverse);
        }
    }
    main();
};

window.onload = () => {
    main();
    document.addEventListener("keydown", keyHandler);
};