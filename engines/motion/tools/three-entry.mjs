// Bundled to vendor/three.iife.js (window.THREE) by `npm run vendor`, because Chrome
// will not load ES modules from file:// pages. Add addons here when a template needs them.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
window.THREE = { ...THREE, RoundedBoxGeometry, RoomEnvironment };
