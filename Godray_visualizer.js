var camera, scene, renderer, container, stats;
var postprocessing = { enabled : true }
var bgColor = new THREE.Color(0x2929a3);
var screenSpacePosition = new THREE.Vector3();
var sunPosition = new THREE.Vector3( 0, 1000, -1000 );

initGodrayVisualizer();
animate();


// Basic Three.js scene setup
function initGodrayVisualizer() {

	// Create a container for the scene and add it to the document body
	container = document.createElement('div');
	document.body.appendChild(container);

	// Initialize the camera
	camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 1, 3000 );
	camera.position.z = 200;

	// Initialize the scene
	scene = new THREE.Scene();

	// Create the sphere geometry and add it to scene
	var sphereMaterial = new THREE.MeshBasicMaterial( { color: 0x000000, shading: THREE.FlatShading } );
	var sphere = new THREE.SphereGeometry( 1, 20, 10 );
	var sphereScale = 20;

	sphereMesh = new THREE.Mesh( sphere, sphereMaterial );
	sphereMesh.scale.set( sphereScale, sphereScale, sphereScale );
	scene.add( sphereMesh );

	// Initialize renderer and add it the scene
	renderer = new THREE.WebGLRenderer( { antialias: false } );
	renderer.setSize( window.innerWidth, window.innerHeight );
	container.appendChild( renderer.domElement );
	renderer.autoClear = false;
	renderer.setClearColor(0x33d6ff);

	// Add stats
	stats = new THREE.Stats();
	container.appendChild( stats.domElement );
}


// Create godrays effects
function initPostprocessing() {

	// Create the postprocessing scene
	postprocessing.scene = new THREE.scene();

	// Create a postprocessing camera and add it to the postprocessing scene
	postprocessing.camera = new THREE.OrthographicCamera( window.innerWidth / - 2, window.innerWidth / 2,  window.innerHeight / 2, window.innerHeight / - 2, -10000, 10000 );
	postprocessing.camera.position.z = 100;
	postprocessing.scene.add(postprocessing.camera);

	var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat };
	postprocessing.rtTextureColors = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, pars );



	var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBFormat };
	postprocessing.rtTextureColors = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, pars );
	// Switching the depth formats to luminance from rgb doesn't seem to work. I didn't
	// investigate further for now.
	// pars.format = THREE.LuminanceFormat;
	// I would have this quarter size and use it as one of the ping-pong render
	// targets but the aliasing causes some temporal flickering
	postprocessing.rtTextureDepth = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, pars );
	// Aggressive downsize god-ray ping-pong render targets to minimize cost
	var w = window.innerWidth / 4.0;
	var h = window.innerHeight / 4.0;
	postprocessing.rtTextureGodRays1 = new THREE.WebGLRenderTarget( w, h, pars );
	postprocessing.rtTextureGodRays2 = new THREE.WebGLRenderTarget( w, h, pars );
	// god-ray shaders
	var godraysGenShader = THREE.ShaderGodRays[ "godrays_generate" ];
	postprocessing.godrayGenUniforms = THREE.UniformsUtils.clone( godraysGenShader.uniforms );
	postprocessing.materialGodraysGenerate = new THREE.ShaderMaterial( {
		uniforms: postprocessing.godrayGenUniforms,
		vertexShader: godraysGenShader.vertexShader,
		fragmentShader: godraysGenShader.fragmentShader
	} );
	var godraysCombineShader = THREE.ShaderGodRays[ "godrays_combine" ];
	postprocessing.godrayCombineUniforms = THREE.UniformsUtils.clone( godraysCombineShader.uniforms );
	postprocessing.materialGodraysCombine = new THREE.ShaderMaterial( {
		uniforms: postprocessing.godrayCombineUniforms,
		vertexShader: godraysCombineShader.vertexShader,
		fragmentShader: godraysCombineShader.fragmentShader
	} );
	var godraysFakeSunShader = THREE.ShaderGodRays[ "godrays_fake_sun" ];
	postprocessing.godraysFakeSunUniforms = THREE.UniformsUtils.clone( godraysFakeSunShader.uniforms );
	postprocessing.materialGodraysFakeSun = new THREE.ShaderMaterial( {
		uniforms: postprocessing.godraysFakeSunUniforms,
		vertexShader: godraysFakeSunShader.vertexShader,
		fragmentShader: godraysFakeSunShader.fragmentShader
	} );
	postprocessing.godraysFakeSunUniforms.bgColor.value.setHex( bgColor );
	postprocessing.godraysFakeSunUniforms.sunColor.value.setHex( sunColor );
	postprocessing.godrayCombineUniforms.fGodRayIntensity.value = 0.75;
	postprocessing.quad = new THREE.Mesh(
		new THREE.PlaneBufferGeometry( window.innerWidth, window.innerHeight ),
		postprocessing.materialGodraysGenerate
	);
	postprocessing.quad.position.z = -9900;
	postprocessing.scene.add( postprocessing.quad );

}


function animate() {
	requestAnimationFrame(animate, renderer.domElement);
	render();
	stats.update(); 
}


function render() {
	if ( postprocessing.enabled ) {
		// Find the screenspace position of the sun
		screenSpacePosition.copy( sunPosition ).project( camera );
		screenSpacePosition.x = ( screenSpacePosition.x + 1 ) / 2;
		screenSpacePosition.y = ( screenSpacePosition.y + 1 ) / 2;
		// Give it to the god-ray and sun shaders
		postprocessing.godrayGenUniforms[ "vSunPositionScreenSpace" ].value.x = screenSpacePosition.x;
		postprocessing.godrayGenUniforms[ "vSunPositionScreenSpace" ].value.y = screenSpacePosition.y;
		postprocessing.godraysFakeSunUniforms[ "vSunPositionScreenSpace" ].value.x = screenSpacePosition.x;
		postprocessing.godraysFakeSunUniforms[ "vSunPositionScreenSpace" ].value.y = screenSpacePosition.y;
		// -- Draw sky and sun --
		// Clear colors and depths, will clear to sky color
		renderer.clearTarget( postprocessing.rtTextureColors, true, true, false );
		// Sun render. Runs a shader that gives a brightness based on the screen
		// space distance to the sun. Not very efficient, so i make a scissor
		// rectangle around the suns position to avoid rendering surrounding pixels.
		var sunsqH = 0.74 * window.innerHeight; // 0.74 depends on extent of sun from shader
		var sunsqW = 0.74 * window.innerHeight; // both depend on height because sun is aspect-corrected
		screenSpacePosition.x *= window.innerWidth;
		screenSpacePosition.y *= window.innerHeight;
		renderer.setScissor( screenSpacePosition.x - sunsqW / 2, screenSpacePosition.y - sunsqH / 2, sunsqW, sunsqH );
		renderer.setScissorTest( true );
		postprocessing.godraysFakeSunUniforms[ "fAspect" ].value = window.innerWidth / window.innerHeight;
		postprocessing.scene.overrideMaterial = postprocessing.materialGodraysFakeSun;
		renderer.render( postprocessing.scene, postprocessing.camera, postprocessing.rtTextureColors );
		renderer.setScissorTest( false );
		// -- Draw scene objects --
		// Colors
		scene.overrideMaterial = null;
		renderer.render( scene, camera, postprocessing.rtTextureColors );
		// Depth
		scene.overrideMaterial = materialDepth;
		renderer.render( scene, camera, postprocessing.rtTextureDepth, true );
		// -- Render god-rays --
		// Maximum length of god-rays (in texture space [0,1]X[0,1])
		var filterLen = 1.0;
		// Samples taken by filter
		var TAPS_PER_PASS = 6.0;
		// Pass order could equivalently be 3,2,1 (instead of 1,2,3), which
		// would start with a small filter support and grow to large. however
		// the large-to-small order produces less objectionable aliasing artifacts that
		// appear as a glimmer along the length of the beams
		// pass 1 - render into first ping-pong target
		var pass = 1.0;
		var stepLen = filterLen * Math.pow( TAPS_PER_PASS, -pass );
		postprocessing.godrayGenUniforms[ "fStepSize" ].value = stepLen;
		postprocessing.godrayGenUniforms[ "tInput" ].value = postprocessing.rtTextureDepth.texture;
		postprocessing.scene.overrideMaterial = postprocessing.materialGodraysGenerate;
		renderer.render( postprocessing.scene, postprocessing.camera, postprocessing.rtTextureGodRays2 );
		// pass 2 - render into second ping-pong target
		pass = 2.0;
		stepLen = filterLen * Math.pow( TAPS_PER_PASS, -pass );
		postprocessing.godrayGenUniforms[ "fStepSize" ].value = stepLen;
		postprocessing.godrayGenUniforms[ "tInput" ].value = postprocessing.rtTextureGodRays2.texture;
		renderer.render( postprocessing.scene, postprocessing.camera, postprocessing.rtTextureGodRays1  );
		// pass 3 - 1st RT
		pass = 3.0;
		stepLen = filterLen * Math.pow( TAPS_PER_PASS, -pass );
		postprocessing.godrayGenUniforms[ "fStepSize" ].value = stepLen;
		postprocessing.godrayGenUniforms[ "tInput" ].value = postprocessing.rtTextureGodRays1.texture;
		renderer.render( postprocessing.scene, postprocessing.camera , postprocessing.rtTextureGodRays2  );
		// final pass - composite god-rays onto colors
		postprocessing.godrayCombineUniforms["tColors"].value = postprocessing.rtTextureColors.texture;
		postprocessing.godrayCombineUniforms["tGodRays"].value = postprocessing.rtTextureGodRays2.texture;
		postprocessing.scene.overrideMaterial = postprocessing.materialGodraysCombine;
		renderer.render( postprocessing.scene, postprocessing.camera );
		postprocessing.scene.overrideMaterial = null;
	} else {
		renderer.clear();
		renderer.render( scene, camera );
	}
}