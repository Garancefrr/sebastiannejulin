// « En situation » en 3D : la toile accrochée dans une pièce sombre,
// éclairée par une applique de tableau en laiton, au-dessus d'un canapé de 2,10 m.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
const mouvementReduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Textures procédurales (aucun fichier à charger) ----------
function toile2d(taille, dessin) {
  const c = document.createElement("canvas");
  c.width = c.height = taille;
  dessin(c.getContext("2d"), taille);
  return c;
}
// Bruit doux : plusieurs couches de taches floues, pour l'enduit et le tissu
function bruit(g, t, couches, opacite) {
  g.fillStyle = "#808080";
  g.fillRect(0, 0, t, t);
  couches.forEach(([n, r]) => {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * t, y = Math.random() * t;
      const v = Math.random() > 0.5 ? 255 : 0;
      const d = g.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, `rgba(${v},${v},${v},${opacite})`);
      d.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = d;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}
function texture(canvas, repetition, couleur = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repetition[0], repetition[1]);
  if (couleur) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const enduit = toile2d(512, (g, t) => bruit(g, t, [[900, 18], [2500, 5], [4000, 1.5]], 0.09));
const tissu = toile2d(256, (g, t) => bruit(g, t, [[3000, 2], [600, 6]], 0.25));

// Parquet en noyer foncé : lames, veinage, légères variations de brillance
const parquetCouleur = toile2d(1024, (g, t) => {
  const lame = t / 8;
  for (let i = 0; i < 8; i++) {
    let y = -Math.random() * t;
    while (y < t) {
      const l = t * (0.5 + Math.random() * 0.7);
      const base = 38 + Math.random() * 16;
      g.fillStyle = `rgb(${base + 14},${base + 6},${base - 2})`;
      g.fillRect(i * lame, y, lame, l);
      g.globalAlpha = 0.18;
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = Math.random() > 0.5 ? "#1c140d" : "#6a5440";
        g.lineWidth = 0.6 + Math.random() * 1.4;
        g.beginPath();
        const x0 = i * lame + Math.random() * lame;
        g.moveTo(x0, y);
        g.bezierCurveTo(x0 + (Math.random() - 0.5) * 14, y + l * 0.3, x0 + (Math.random() - 0.5) * 14, y + l * 0.7, x0 + (Math.random() - 0.5) * 6, y + l);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = "rgba(0,0,0,0.75)";
      g.fillRect(i * lame, y, lame, 2);
      y += l;
    }
    g.fillStyle = "rgba(0,0,0,0.8)";
    g.fillRect(i * lame, 0, 2, t);
  }
});
// Placage de noyer : fil horizontal, quelques ondulations
const placage = toile2d(1024, (g, t) => {
  const fond = g.createLinearGradient(0, 0, 0, t);
  fond.addColorStop(0, "#5b3a22"); fond.addColorStop(0.5, "#4a2f1b"); fond.addColorStop(1, "#5e3d25");
  g.fillStyle = fond;
  g.fillRect(0, 0, t, t);
  for (let k = 0; k < 220; k++) {
    const y0 = Math.random() * t;
    const ampl = 4 + Math.random() * 18;
    const freq = 0.004 + Math.random() * 0.01;
    const phase = Math.random() * 6;
    g.strokeStyle = Math.random() > 0.55 ? "rgba(30,17,8,0.35)" : "rgba(140,95,60,0.18)";
    g.lineWidth = 0.6 + Math.random() * 2.2;
    g.beginPath();
    for (let x = 0; x <= t; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * ampl;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
});
const parquetRugosite = toile2d(256, (g, t) => bruit(g, t, [[800, 10]], 0.35));

// ---------- Scène ----------
let renderer, scene, camera, conteneur, observateur;
let toile, tranches, materiauToile, applique, spot, meuble, plinthe;
let enMarche = false, image = null;
const vue = { az: 0.28, el: 0.04, azCible: 0.28, elCible: 0.04, glisse: null, temps: 0 };
let cible = new THREE.Vector3(0, 1.4, 0);
let distance = 4.4;

function construire() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "situation3d__rendu";

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060606);
  scene.fog = new THREE.Fog(0x060606, 6, 11);

  // Reflets discrets sur le laiton et le parquet
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);

  // Mur en enduit sombre, légèrement chaud
  const mur = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 3.2),
    new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.95, bumpMap: texture(enduit, [4, 1.4]), bumpScale: 0.6, envMapIntensity: 0.15 })
  );
  mur.position.set(0, 1.6, 0);
  mur.receiveShadow = true;
  scene.add(mur);

  plinthe = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x2c2925, roughness: 0.7 }));
  plinthe.position.set(0, 0.05, 0.01);
  plinthe.receiveShadow = true;
  scene.add(plinthe);

  // Parquet
  const sol = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({
      map: texture(parquetCouleur, [3, 2], true),
      roughnessMap: texture(parquetRugosite, [3, 2]),
      roughness: 0.55,
      envMapIntensity: 0.5,
    })
  );
  sol.rotation.x = -Math.PI / 2;
  sol.position.set(0, 0, 3);
  sol.receiveShadow = true;
  scene.add(sol);

  // Enfilade de 1,80 m en noyer, avec un vase et quelques livres
  meuble = new THREE.Group();
  const noyerFace = new THREE.MeshStandardMaterial({ map: texture(placage, [1, 1], true), roughness: 0.48, envMapIntensity: 0.6 });
  const noyerFil = new THREE.MeshStandardMaterial({ map: texture(placage, [0.6, 0.25], true), roughness: 0.5, envMapIntensity: 0.6 });
  const L = 1.8, H = 0.5, P = 0.45, PIEDS = 0.14;
  const ajouter = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    meuble.add(m);
    return m;
  };
  // Caisson, plateau légèrement débordant
  ajouter(new RoundedBoxGeometry(L - 0.01, H - 0.03, P - 0.02, 2, 0.006), noyerFil, 0, PIEDS + (H - 0.03) / 2, P / 2 - 0.005);
  ajouter(new RoundedBoxGeometry(L + 0.02, 0.03, P + 0.01, 2, 0.008), noyerFil, 0, PIEDS + H - 0.015, P / 2);
  // Quatre portes, séparées par de fins joints sombres
  const largeurPorte = (L - 0.05) / 4;
  for (let k = 0; k < 4; k++) {
    const x = -L / 2 + 0.025 + largeurPorte * (k + 0.5);
    const porte = ajouter(new RoundedBoxGeometry(largeurPorte - 0.006, H - 0.07, 0.018, 2, 0.003), noyerFace, x, PIEDS + (H - 0.03) / 2 - 0.005, P - 0.004);
    porte.material = noyerFace.clone();
    porte.material.map = noyerFace.map.clone();
    porte.material.map.offset.set(k * 0.27, 0);
    porte.material.map.needsUpdate = true;
  }
  // Pieds fuselés en bois sombre, légèrement inclinés
  const piedMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.55 });
  [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const pied = ajouter(new THREE.CylinderGeometry(0.018, 0.011, PIEDS + 0.01, 16), piedMat, sx * (L / 2 - 0.09), PIEDS / 2, sz ? P - 0.07 : 0.07);
    pied.rotation.z = sx * 0.12;
    pied.rotation.x = (sz ? 1 : -1) * 0.08;
  });
  // Vase en céramique mate, tourné au tour
  const profil = [[0, 0], [0.07, 0], [0.085, 0.03], [0.1, 0.12], [0.09, 0.2], [0.05, 0.27], [0.035, 0.31], [0.04, 0.34], [0.036, 0.345]].map(([r, y]) => new THREE.Vector2(r, y));
  const ceramique = new THREE.MeshStandardMaterial({ color: 0xa39c8f, roughness: 0.85, bumpMap: texture(tissu, [2, 2]), bumpScale: 0.25, envMapIntensity: 0.4 });
  ajouter(new THREE.LatheGeometry(profil, 48), ceramique, -L / 2 + 0.32, PIEDS + H, P / 2 - 0.02);
  // Pile de livres
  [[0.3, 0.035, 0.22, 0x2d3a3f], [0.27, 0.03, 0.2, 0xb9ad96], [0.25, 0.04, 0.19, 0x4a3226]].reduce((y, [l, e, p, c], k) => {
    const livre = ajouter(new THREE.BoxGeometry(l, e, p), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), L / 2 - 0.36, y + e / 2, P / 2 - 0.03);
    livre.rotation.y = (k - 1) * 0.08;
    return y + e;
  }, PIEDS + H);
  scene.add(meuble);

  // La toile : face peinte, tranches sombres, 3 cm d'épaisseur
  materiauToile = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, envMapIntensity: 0.25 });
  tranches = new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 0.9 });
  toile = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.03), [tranches, tranches, tranches, tranches, materiauToile, tranches]);
  toile.castShadow = true;
  toile.receiveShadow = true;
  scene.add(toile);

  // Applique de tableau en laiton : bras fixé au mur, barre lumineuse
  applique = new THREE.Group();
  const laiton = new THREE.MeshStandardMaterial({ color: 0xb48a4e, metalness: 1, roughness: 0.32, envMapIntensity: 1.2 });
  const socle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24), laiton);
  socle.rotation.x = Math.PI / 2;
  socle.position.z = 0.006;
  const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.24, 12), laiton);
  bras.rotation.x = Math.PI / 2 - 0.25;
  bras.position.set(0, 0.03, 0.115);
  const rotule = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), laiton);
  rotule.position.set(0, 0.06, 0.23);
  const barre = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 32), laiton);
  barre.rotation.z = Math.PI / 2;
  barre.position.set(0, 0.06, 0.24);
  barre.name = "barre";
  const diffuseur = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd7a0, emissiveIntensity: 2.2 })
  );
  diffuseur.rotation.x = Math.PI / 2 + 0.5;
  diffuseur.position.set(0, 0.035, 0.25);
  diffuseur.name = "diffuseur";
  [socle, bras, rotule, barre].forEach((m) => { m.castShadow = true; });
  applique.add(socle, bras, rotule, barre, diffuseur);
  scene.add(applique);

  // La lumière de l'applique, chaude, qui coule sur la toile
  spot = new THREE.SpotLight(0xffd2a0, 0, 6, 1, 1, 1.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 6;
  scene.add(spot, spot.target);

  // Très peu de lumière ailleurs : un rai bleuté venu d'une fenêtre hors champ
  const lune = new THREE.DirectionalLight(0x8fa3c4, 0.16);
  lune.position.set(-4, 3, 4);
  scene.add(lune);
  scene.add(new THREE.HemisphereLight(0x6b6660, 0x0d0b09, 0.22));

  // Glisser pour tourner un peu autour de la toile
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    vue.glisse = { x: e.clientX, y: e.clientY, az: vue.azCible, el: vue.elCible };
  });
  el.addEventListener("pointermove", (e) => {
    if (!vue.glisse) return;
    vue.azCible = Math.max(-0.6, Math.min(0.6, vue.glisse.az - (e.clientX - vue.glisse.x) * 0.004));
    vue.elCible = Math.max(-0.05, Math.min(0.3, vue.glisse.el + (e.clientY - vue.glisse.y) * 0.003));
  });
  const lacher = () => { vue.glisse = null; };
  el.addEventListener("pointerup", lacher);
  el.addEventListener("pointercancel", lacher);
}

// ---------- Accrocher une toile ----------
const chargeur = new THREE.TextureLoader();

function accrocher(o) {
  const h = o.hauteur;           // mètres
  const w = o.hauteur * o.ratio;
  const bas = Math.max(0.9, 1.55 - h / 2); // centre à 1,55 m, au moins 26 cm au-dessus de l'enfilade
  const centre = bas + h / 2;

  toile.scale.set(w, h, 1);
  toile.position.set(0, centre, 0.016);

  // Applique : barre un peu plus courte que la toile, juste au-dessus
  const longueur = Math.min(Math.max(w * 0.55, 0.4), 0.9);
  applique.getObjectByName("barre").scale.y = longueur;
  applique.getObjectByName("diffuseur").scale.x = longueur * 0.92;
  applique.position.set(0, bas + h + 0.1, 0);

  // Source un peu en retrait de la barre : la lumière s'étale sur toute la toile, plus forte en haut
  spot.position.set(0, bas + h + 0.32, 0.62);
  spot.target.position.set(0, centre - h * 0.18, 0);
  spot.distance = h + 2.4;
  spot.angle = Math.min(1.15, Math.atan2(Math.max(w, h) * 0.8, 0.9));

  // Cadrer la scène pour voir la toile, le canapé et un peu de mur
  cible = new THREE.Vector3(0, Math.max(1.05, centre * 0.78), 0);
  const hauteurVue = Math.max(bas + h + 0.6, 2.4);
  distance = (hauteurVue / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 1.2;
  vue.az = vue.azCible = 0.32;
  vue.el = vue.elCible = 0.05;

  chargeur.load(o.image, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (materiauToile.map) materiauToile.map.dispose();
    materiauToile.map = t;
    materiauToile.needsUpdate = true;
    // La lumière s'allume une fois la toile accrochée
    allumage = 0;
  });
}
let allumage = 1;

// ---------- Boucle ----------
function dimensionner() {
  const r = conteneur.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  // Sur un écran étroit, on recule pour garder le canapé entier
  camera.fov = camera.aspect < 0.9 ? 46 : 32;
  camera.updateProjectionMatrix();
}

function boucle() {
  if (!enMarche) return;
  vue.temps += 0.016;
  const derive = mouvementReduit || vue.glisse ? 0 : Math.sin(vue.temps * 0.35) * 0.05;
  vue.az += (vue.azCible + derive - vue.az) * 0.06;
  vue.el += (vue.elCible - vue.el) * 0.06;
  const recul = distance * (camera.aspect < 0.9 ? 1.25 : 1);
  camera.position.set(
    cible.x + Math.sin(vue.az) * recul,
    cible.y + 0.15 + Math.sin(vue.el) * recul,
    Math.cos(vue.az) * recul
  );
  camera.lookAt(cible);

  if (allumage < 1) {
    allumage = Math.min(1, allumage + (mouvementReduit ? 1 : 0.022));
    const a = 1 - Math.pow(1 - allumage, 3);
    spot.intensity = 4.2 * a;
    applique.getObjectByName("diffuseur").material.emissiveIntensity = 2.2 * a;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(boucle);
}

// ---------- Interface publique ----------
export function ouvrir(element, oeuvre) {
  if (!renderer) construire();
  conteneur = element;
  if (renderer.domElement.parentNode !== element) element.appendChild(renderer.domElement);
  if (!observateur) observateur = new ResizeObserver(dimensionner);
  observateur.observe(element);
  dimensionner();
  spot.intensity = 0;
  applique.getObjectByName("diffuseur").material.emissiveIntensity = 0;
  accrocher(oeuvre);
  if (!enMarche) { enMarche = true; requestAnimationFrame(boucle); }
}

export function fermer() {
  enMarche = false;
  if (observateur && conteneur) observateur.unobserve(conteneur);
}
