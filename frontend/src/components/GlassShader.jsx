import React, { useEffect, useRef } from 'react';

export const GlassShader = ({ liveRef }) => {
  const canvasRef = useRef(null);
  const uRef = useRef({});
  const timeRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    // Force full reload when this module is hot-updated
    if (import.meta.hot) {
      import.meta.hot.dispose(() => window.location.reload());
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false })
            || canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) { console.warn('No WebGL'); return; }

    // ── Shaders defined HERE so they are fresh on every reinit ──
    const VERT = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const FRAG = `
      precision highp float;
      uniform vec2 u_res;
      uniform vec2 u_center;
      uniform vec2 u_size;
      uniform float u_radius;
      uniform float u_time;
      varying vec2 v_uv;

      float sdRoundedBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) - r;
      }

      void main() {
        vec2 px = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
        vec2 halfSize = u_size * 0.5;
        vec2 local = px - u_center;

        float d = sdRoundedBox(local, halfSize, u_radius);
        if (d > 2.0) discard;

        float edgeDist = -d;
        float edgeFactor = 1.0 - smoothstep(0.0, 25.0, edgeDist);

        // Fresnel
        float fresnel = pow(edgeFactor, 2.5);

        // ── Specular: bright top-edge light catch ──
        float topDist = local.y + halfSize.y;
        float topHL = smoothstep(12.0, 0.0, topDist);

        // ── Bottom glow ──
        float botDist = halfSize.y - local.y;
        float botHL = smoothstep(16.0, 0.0, botDist);

        // ── Side highlights ──
        float sideL = local.x + halfSize.x;
        float sideR = halfSize.x - local.x;
        float sideHL = smoothstep(8.0, 0.0, sideL) + smoothstep(8.0, 0.0, sideR);

        // ── Animated shimmer caustics ──
        float s1 = sin(u_time * 2.5 + px.x * 0.012 + px.y * 0.006) * 0.5 + 0.5;
        float s2 = cos(u_time * 1.8 + px.x * 0.008 - px.y * 0.01) * 0.5 + 0.5;

        // ── Compose: bright white highlights on transparent ──
        vec3 color = vec3(0.0);

        // Specular rim
        color += vec3(1.0) * topHL * 0.9;
        color += vec3(0.6, 0.65, 0.8) * botHL * 0.3;
        color += vec3(0.7, 0.75, 0.9) * sideHL * 0.35;

        // Fresnel white edge
        color += vec3(1.0) * fresnel * 0.5;

        // Shimmer
        color += vec3(0.8, 0.85, 1.0) * edgeFactor * s1 * 0.25;
        color += vec3(0.6, 0.7, 0.95) * edgeFactor * s2 * 0.15;

        // Internal reflection streak
        float streak = smoothstep(0.0, 1.0, topDist) * smoothstep(60.0, 18.0, topDist);
        color += vec3(0.5, 0.55, 0.7) * streak * 0.2;

        // Alpha: mostly transparent, highlights are bright
        float alpha = fresnel * 0.6 + topHL * 0.8 + sideHL * 0.25 + botHL * 0.15;

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uRef.current.res) {
        gl.uniform2f(uRef.current.res, canvas.width / dpr, canvas.height / dpr);
      }
    };
    resize();

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Link:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    uRef.current = {
      res:    gl.getUniformLocation(prog, 'u_res'),
      center: gl.getUniformLocation(prog, 'u_center'),
      size:   gl.getUniformLocation(prog, 'u_size'),
      time:   gl.getUniformLocation(prog, 'u_time'),
      radius: gl.getUniformLocation(prog, 'u_radius'),
    };

    gl.uniform2f(uRef.current.res, canvas.width / dpr, canvas.height / dpr);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const animate = () => {
      timeRef.current += 0.016;
      const p = liveRef.current;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRef.current.center, p.x + p.w / 2, p.y + p.h / 2);
      gl.uniform2f(uRef.current.size, p.w, p.h);
      gl.uniform1f(uRef.current.time, timeRef.current);
      gl.uniform1f(uRef.current.radius, p.radius || 28);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      uRef.current = {};
    };
  }, [liveRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 51,
      }}
    />
  );
};

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}
