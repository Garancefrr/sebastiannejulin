(function () {
  // ---------- Réglages ----------
  // Clé Web3Forms : à créer sur https://web3forms.com avec l'adresse de Sébastianne, puis à coller ici.
  // Tant qu'elle est vide, le formulaire ouvre un e-mail pré-rempli à la place.
  const WEB3FORMS_CLE = "";
  const EMAIL = "sebastianne.fourreau@dbmail.com";

  const OEUVRES = window.OEUVRES || [];
  const CHAPITRES = ["nuage", "oeuvres", "artiste", "parcours", "contact"];
  const LIBELLES = { nuage: "Accueil", oeuvres: "Œuvres", artiste: "L'artiste", parcours: "Expositions et formation", contact: "Contact" };
  const mouvementReduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Photos allégées (WebP) : 800 px pour les vignettes, 1600 px pour les grandes vues
  const photo = (o, taille) => `images/web/${o.image.replace(".jpg", "")}-${taille}.webp`;

  // Proportions largeur / hauteur des photos, pour réserver la place avant chargement
  const RATIOS = {
    "oeuvre-01.jpg": 1.51, "oeuvre-02.jpg": 1, "oeuvre-03.jpg": 0.767, "oeuvre-04.jpg": 0.585, "oeuvre-05.jpg": 0.678,
    "oeuvre-06.jpg": 0.524, "oeuvre-07.jpg": 0.701, "oeuvre-09.jpg": 0.789, "oeuvre-10.jpg": 0.776, "oeuvre-11.jpg": 0.631,
    "oeuvre-13.jpg": 0.728, "oeuvre-14.jpg": 0.801, "oeuvre-15.jpg": 0.673, "oeuvre-16.jpg": 0.646, "oeuvre-17.jpg": 0.686,
    "oeuvre-18.jpg": 0.582, "oeuvre-19.jpg": 0.894, "oeuvre-20.jpg": 0.8, "oeuvre-21.jpg": 0.68, "oeuvre-22.jpg": 0.657,
    "oeuvre-23.jpg": 1.047,
  };
  const ratio = (o) => RATIOS[o.image] || 0.75;
  const format = (o) => (o.dimensions ? `${o.dimensions} cm` : "");
  const hauteurCm = (o) => { const n = (o.dimensions || "").match(/\d+/); return n ? parseInt(n[0], 10) : 0; };
  // « Paysage imaginaire XIV » → « paysage-imaginaire-xiv », pour les liens directs
  const slug = (o) => o.titre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const parSlug = (s) => OEUVRES.find((o) => slug(o) === s);
  const estSaisie = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

  // ---------- Navigation entre chapitres ----------
  const sections = Object.fromEntries(CHAPITRES.map((c) => [c, document.getElementById(c)]));
  const progression = document.getElementById("progression");
  CHAPITRES.forEach((c) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", LIBELLES[c]);
    b.addEventListener("click", () => aller(c));
    li.appendChild(b);
    progression.appendChild(li);
  });

  let courant = null;
  let verrou = 0;

  function aller(nomChapitre) {
    if (!sections[nomChapitre] || nomChapitre === courant) return;
    const iNouveau = CHAPITRES.indexOf(nomChapitre);
    CHAPITRES.forEach((c, i) => {
      sections[c].classList.toggle("est-actif", c === nomChapitre);
      sections[c].classList.toggle("est-passe", i < iNouveau);
      sections[c].setAttribute("aria-hidden", c === nomChapitre ? "false" : "true");
      sections[c].inert = c !== nomChapitre;
    });
    progression.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-current", String(i === iNouveau)));
    document.querySelectorAll(".pilule").forEach((p) => p.setAttribute("aria-current", String(p.getAttribute("href") === `#/${nomChapitre}`)));
    courant = nomChapitre;
    verrou = performance.now() + 1100;
    if (fiche.hidden && location.hash !== `#/${nomChapitre}`) history.replaceState(null, "", `#/${nomChapitre}`);
    if (nomChapitre === "nuage") nuage.ouvrir();
    if (nomChapitre === "oeuvres") carrousel.placer();
  }
  const decaler = (pas) => {
    const i = CHAPITRES.indexOf(courant) + pas;
    if (i >= 0 && i < CHAPITRES.length) aller(CHAPITRES[i]);
  };

  // Adresse : #/chapitre ou #/oeuvre/titre-de-la-toile
  function suivreAdresse() {
    const chemin = location.hash.replace(/^#\/?/, "");
    if (chemin.startsWith("oeuvre/")) {
      const o = parSlug(chemin.slice(7));
      if (o) {
        if (!courant) aller("oeuvres");
        carrousel.montrer(OEUVRES.indexOf(o));
        ouvrirFiche(o, { historique: false });
        history.replaceState(null, "", `#/oeuvre/${slug(o)}`);
        return;
      }
    }
    if (!fiche.hidden) fermerFiche({ historique: false });
    aller(CHAPITRES.includes(chemin) ? chemin : courant || CHAPITRES[0]);
  }
  window.addEventListener("hashchange", suivreAdresse);
  document.querySelectorAll("[data-suivant]").forEach((b) => b.addEventListener("click", () => decaler(1)));

  // Zones qui défilent à l'intérieur d'un chapitre (sur petit écran, ou la grille des œuvres)
  function zoneDefilante() {
    if (courant === "oeuvres") return vueGrille ? grille : null;
    const sel = { artiste: ".artiste__contenu", parcours: ".parcours", contact: ".contact" }[courant];
    return sel ? sections[courant].querySelector(sel) : null;
  }
  function peutDefiler(el, sens) {
    if (!el || el.scrollHeight <= el.clientHeight + 2) return false;
    return sens > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 0;
  }

  // Molette : un cran = un chapitre (sauf si la zone affichée défile d'elle-même)
  let cumul = 0;
  let minuterieMolette = null;
  window.addEventListener("wheel", (e) => {
    if (!fiche.hidden || !legal.hidden) return;
    if (courant === "oeuvres" && !vueGrille && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      cumul += e.deltaX;
      if (Math.abs(cumul) > 70 && performance.now() > verrou) {
        carrousel.decaler(cumul > 0 ? 1 : -1);
        verrou = performance.now() + 500;
        cumul = 0;
      }
      return;
    }
    const zone = zoneDefilante();
    if (peutDefiler(zone, Math.sign(e.deltaY))) {
      verrou = performance.now() + 400; // laisser finir l'élan avant de changer de chapitre
      return;
    }
    e.preventDefault();
    cumul += e.deltaY;
    if (Math.abs(cumul) > 60 && performance.now() > verrou) {
      decaler(cumul > 0 ? 1 : -1);
      cumul = 0;
    }
    clearTimeout(minuterieMolette);
    minuterieMolette = setTimeout(() => { cumul = 0; }, 200);
  }, { passive: false });

  // Glissé vertical sur écran tactile (sauf dans le nuage, où le doigt fait tourner les toiles)
  let toucheDepart = null;
  window.addEventListener("touchstart", (e) => {
    const zone = zoneDefilante();
    toucheDepart = { x: e.touches[0].clientX, y: e.touches[0].clientY, haut: zone ? zone.scrollTop : 0 };
  }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (!toucheDepart || !fiche.hidden || !legal.hidden || courant === "nuage" || estSaisie(document.activeElement)) return;
    const dx = e.changedTouches[0].clientX - toucheDepart.x;
    const dy = e.changedTouches[0].clientY - toucheDepart.y;
    const zone = zoneDefilante();
    const aDefile = zone && zone.scrollTop !== toucheDepart.haut;
    toucheDepart = null;
    if (aDefile) return;
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      if (peutDefiler(zone, dy < 0 ? 1 : -1)) return;
      decaler(dy < 0 ? 1 : -1);
    }
  }, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (!legal.hidden) { if (e.key === "Escape") fermerMentions(); return; }
    if (!fiche.hidden) { if (e.key === "Escape") fermerFiche(); return; }
    if (estSaisie(e.target)) return;
    if (["ArrowDown", "PageDown", " "].includes(e.key)) {
      if (peutDefiler(zoneDefilante(), 1)) return;
      e.preventDefault(); decaler(1);
    }
    if (["ArrowUp", "PageUp"].includes(e.key)) {
      if (peutDefiler(zoneDefilante(), -1)) return;
      e.preventDefault(); decaler(-1);
    }
    if (courant === "oeuvres" && !vueGrille && e.key === "ArrowRight") carrousel.decaler(1);
    if (courant === "oeuvres" && !vueGrille && e.key === "ArrowLeft") carrousel.decaler(-1);
  });

  // ---------- 1. Accueil : nuage de toiles en 3D ----------
  const nuage = (() => {
    const scene = document.getElementById("nuage-scene");
    const section = sections.nuage;
    const n = OEUVRES.length;
    const or = Math.PI * (3 - Math.sqrt(5));
    const cartes = OEUVRES.map((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nuage__carte";
      b.setAttribute("aria-label", `Voir ${o.titre}`);
      const img = document.createElement("img");
      img.src = photo(o, 800);
      img.alt = "";
      img.draggable = false;
      b.appendChild(img);
      scene.appendChild(b);
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const t = i * or;
      const taille = 0.85 + ((i * 37) % 10) / 22;
      return { o, el: b, x: Math.cos(t) * r, y, z: Math.sin(t) * r, taille };
    });

    let ay = 0, ax = -0.12, vy = 0.0016, vx = 0;
    let ouverture = 1;
    let glisse = null;

    function dimensionner() {
      const base = Math.min(170, Math.max(64, Math.min(window.innerHeight * 0.18, window.innerWidth * 0.2)));
      cartes.forEach((c) => {
        const h = base * c.taille;
        c.el.style.height = `${h}px`;
        c.el.style.width = `${h * ratio(c.o)}px`;
      });
    }
    dimensionner();
    window.addEventListener("resize", dimensionner);

    function image() {
      if ((courant === "nuage" || ouverture < 1) && fiche.hidden) {
        if (!glisse) {
          ay += vy;
          ax += vx;
          vy += (0.0016 - vy) * 0.02;
          vx *= 0.94;
        }
        ax = Math.max(-0.6, Math.min(0.6, ax));
        ouverture += (1 - ouverture) * 0.045;
        const largeur = section.clientWidth, hauteur = section.clientHeight;
        const Rx = Math.min(largeur * 0.44, 680) * ouverture;
        const Ry = hauteur * 0.4 * ouverture;
        const Rz = 520 * ouverture;
        const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
        cartes.forEach((c) => {
          const x1 = c.x * cy + c.z * sy;
          const z1 = -c.x * sy + c.z * cy;
          const y1 = c.y * cx - z1 * sx;
          const z2 = c.y * sx + z1 * cx;
          const px = x1 * Rx, py = y1 * Ry, pz = z2 * Rz;
          c.el.style.transform = `translate(-50%, -50%) translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, ${pz.toFixed(1)}px) rotateY(${(-x1 * 22).toFixed(1)}deg)`;
          c.el.style.opacity = (0.18 + 0.82 * ((z2 + 1) / 2)).toFixed(2);
          c.el.style.zIndex = String(Math.round((z2 + 1) * 100));
        });
      }
      requestAnimationFrame(image);
    }
    requestAnimationFrame(image);

    section.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".suite")) return;
      section.setPointerCapture(e.pointerId);
      glisse = { x: e.clientX, y: e.clientY, bouge: false, cible: e.target.closest(".nuage__carte") };
    });
    section.addEventListener("pointermove", (e) => {
      if (!glisse) return;
      const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
      if (Math.hypot(dx, dy) > 5) { glisse.bouge = true; section.classList.add("est-en-glisse"); }
      vy = dx * 0.0022;
      vx = -dy * 0.0016;
      ay += vy;
      ax += vx;
      glisse.x = e.clientX;
      glisse.y = e.clientY;
    });
    section.addEventListener("pointerup", () => {
      if (!glisse) return;
      const { bouge, cible } = glisse;
      glisse = null;
      section.classList.remove("est-en-glisse");
      if (!bouge && cible) {
        const c = cartes.find((k) => k.el === cible);
        if (c) ouvrirFiche(c.o);
      }
    });
    cartes.forEach((c) => c.el.addEventListener("keydown", (e) => { if (e.key === "Enter") ouvrirFiche(c.o); }));

    return { ouvrir() { ouverture = mouvementReduit ? 1 : 0.15; } };
  })();

  // ---------- 2. Œuvres : carrousel ----------
  const carrousel = (() => {
    const piste = document.getElementById("piste");
    const compteur = document.getElementById("compteur");
    let actif = 0;
    const cartes = OEUVRES.map((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carte";
      const img = document.createElement("img");
      img.src = photo(o, 1600);
      img.alt = o.titre;
      img.loading = i < 3 ? "eager" : "lazy";
      img.draggable = false;
      const titre = document.createElement("span");
      titre.className = "carte__titre";
      titre.textContent = o.titre;
      const infos = document.createElement("span");
      infos.className = "carte__infos";
      [o.annee, format(o), o.statut === "vendue" ? "Collection particulière" : ""].filter(Boolean).forEach((t, k) => {
        if (k) infos.appendChild(document.createElement("br"));
        infos.appendChild(document.createTextNode(t));
      });
      b.append(img, titre, infos);
      b.addEventListener("click", () => {
        if (glisseRecent) return;
        if (i === actif) ouvrirFiche(o);
        else montrer(i);
      });
      piste.appendChild(b);
      return b;
    });

    // Hauteur commune, sauf pour les toiles trop larges qui doivent tenir dans l'écran
    function dimensionner() {
      const zone = piste.parentElement;
      const hMax = Math.min(zone.clientHeight * (zone.clientWidth < 760 ? 0.5 : 0.6), 660);
      const lMax = zone.clientWidth * 0.8;
      cartes.forEach((k, i) => {
        const r = ratio(OEUVRES[i]);
        const h = Math.min(hMax, lMax / r);
        k.style.height = `${h}px`;
        k.style.width = `${h * r}px`;
      });
    }
    function placer() {
      dimensionner();
      const c = cartes[actif];
      const centre = c.offsetLeft + c.offsetWidth / 2;
      piste.style.transform = `translate(${piste.parentElement.clientWidth / 2 - centre}px, -50%)`;
      cartes.forEach((k, i) => {
        k.classList.toggle("est-active", i === actif);
        k.tabIndex = i === actif ? 0 : -1;
      });
      compteur.textContent = `${String(actif + 1).padStart(2, "0")} / ${String(cartes.length).padStart(2, "0")}`;
    }
    function montrer(i) { actif = Math.max(0, Math.min(cartes.length - 1, i)); placer(); }

    document.getElementById("precedente").addEventListener("click", () => montrer(actif - 1));
    document.getElementById("suivante").addEventListener("click", () => montrer(actif + 1));
    window.addEventListener("resize", placer);
    cartes.forEach((c) => c.querySelector("img").addEventListener("load", () => { if (courant === "oeuvres") placer(); }));

    let depart = null, glisseRecent = false;
    const zone = document.getElementById("carrousel");
    zone.addEventListener("pointerdown", (e) => { depart = e.clientX; glisseRecent = false; });
    zone.addEventListener("pointerup", (e) => {
      if (depart === null) return;
      const dx = e.clientX - depart;
      depart = null;
      if (Math.abs(dx) > 50) {
        glisseRecent = true;
        montrer(actif + (dx < 0 ? 1 : -1));
        setTimeout(() => { glisseRecent = false; }, 50);
      }
    });

    return { placer, montrer, decaler: (p) => montrer(actif + p) };
  })();

  // ---------- 2 bis. Œuvres : toutes en grille ----------
  const grille = document.getElementById("grille");
  const boutonCarrousel = document.getElementById("vue-carrousel");
  const boutonGrille = document.getElementById("vue-grille");
  let vueGrille = false;
  const colonnes = document.createElement("div");
  colonnes.className = "grille__colonnes";
  grille.appendChild(colonnes);
  OEUVRES.forEach((o) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "grille__toile";
    const img = document.createElement("img");
    img.src = photo(o, 800);
    img.alt = "";
    img.loading = "lazy";
    img.style.aspectRatio = String(ratio(o));
    const legende = document.createElement("span");
    legende.className = "grille__legende";
    const t = document.createElement("strong");
    t.textContent = o.titre;
    const a = document.createElement("span");
    a.textContent = [o.annee, format(o)].filter(Boolean).join(" · ");
    legende.append(t, a);
    b.append(img, legende);
    b.addEventListener("click", () => ouvrirFiche(o));
    colonnes.appendChild(b);
  });
  function changerVue(enGrille) {
    vueGrille = enGrille;
    grille.hidden = !enGrille;
    sections.oeuvres.classList.toggle("est-en-grille", enGrille);
    boutonGrille.setAttribute("aria-pressed", String(enGrille));
    boutonCarrousel.setAttribute("aria-pressed", String(!enGrille));
    if (!enGrille) carrousel.placer();
  }
  boutonGrille.addEventListener("click", () => changerVue(true));
  boutonCarrousel.addEventListener("click", () => changerVue(false));

  // ---------- Fiche plein écran ----------
  const fiche = document.getElementById("fiche");
  const ficheZone = document.getElementById("fiche-zone");
  const ficheImg = document.getElementById("fiche-image");
  const situation = document.getElementById("situation");
  const boutonToile = document.getElementById("vue-toile");
  const boutonSituation = document.getElementById("vue-situation");
  const boutonPartager = document.getElementById("partager");
  let retourFocus = null;
  let ficheDansHistorique = false;
  let oeuvreOuverte = null;

  function ouvrirFiche(o, { historique = true } = {}) {
    if (fiche.hidden) retourFocus = document.activeElement;
    oeuvreOuverte = o;
    const i = OEUVRES.indexOf(o);
    ficheZone.classList.remove("est-zoomee");
    ficheImg.removeAttribute("style");
    ficheImg.src = photo(o, 1600);
    ficheImg.alt = o.titre;
    document.getElementById("fiche-numero").textContent = `Œuvre ${String(i + 1).padStart(2, "0")} / ${String(OEUVRES.length).padStart(2, "0")}`;
    document.getElementById("fiche-titre").textContent = o.titre;
    const details = document.getElementById("fiche-details");
    details.replaceChildren();
    [["Année", o.annee], ["Format", format(o)], ["Technique", o.technique], ["Note", o.note]].filter(([, v]) => v).forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      details.append(dt, dd);
    });
    const action = document.getElementById("fiche-action");
    action.replaceChildren();
    if (o.statut === "vendue") {
      const p = document.createElement("p");
      p.className = "fiche__vendue";
      p.textContent = "Collection particulière";
      action.appendChild(p);
    } else {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bouton-verre bouton-verre--clair";
      b.textContent = "Demander des informations";
      b.addEventListener("click", () => demanderInfos(o));
      action.appendChild(b);
    }
    // « En situation » n'a de sens que si le format est connu
    boutonSituation.disabled = !hauteurCm(o);
    boutonSituation.title = hauteurCm(o) ? "" : "Format non renseigné";
    montrerSituation(false);
    boutonPartager.textContent = navigator.share ? "Partager" : "Copier le lien";

    if (historique && fiche.hidden) {
      history.pushState(null, "", `#/oeuvre/${slug(o)}`);
      ficheDansHistorique = true;
    } else if (historique) {
      history.replaceState(null, "", `#/oeuvre/${slug(o)}`);
    }
    fiche.hidden = false;
    document.getElementById("fiche-fermer").focus();
  }

  function fermerFiche({ historique = true, vers = null } = {}) {
    if (fiche.hidden) return;
    fiche.hidden = true;
    oeuvreOuverte = null;
    fermer3d();
    if (historique) {
      if (vers || !ficheDansHistorique) history.replaceState(null, "", `#/${vers || courant}`);
      else { ignorerAdresse = true; history.back(); }
    }
    ficheDansHistorique = false;
    if (retourFocus && document.contains(retourFocus)) retourFocus.focus();
  }
  // Le retour arrière du navigateur ferme la fiche : on ne rejoue pas l'adresse précédente
  let ignorerAdresse = false;
  window.removeEventListener("hashchange", suivreAdresse);
  window.addEventListener("hashchange", () => {
    if (ignorerAdresse) { ignorerAdresse = false; return; }
    suivreAdresse();
  });
  document.getElementById("fiche-fermer").addEventListener("click", () => fermerFiche());

  // Zoom dans la matière : la photo à sa taille réelle, qu'on parcourt avec la souris ou le doigt
  function deplacerZoom(e) {
    const r = ficheZone.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const w = ficheImg.naturalWidth, h = ficheImg.naturalHeight;
    ficheImg.style.left = `${Math.min(0, (r.width - w) * px)}px`;
    ficheImg.style.top = `${Math.min(0, (r.height - h) * py)}px`;
  }
  ficheZone.addEventListener("click", (e) => {
    if (!situation.hidden) return;
    const zoom = !ficheZone.classList.contains("est-zoomee");
    ficheZone.classList.toggle("est-zoomee", zoom);
    if (zoom) {
      ficheImg.style.width = `${ficheImg.naturalWidth}px`;
      deplacerZoom(e);
    } else ficheImg.removeAttribute("style");
  });
  ficheZone.addEventListener("pointermove", (e) => { if (ficheZone.classList.contains("est-zoomee")) deplacerZoom(e); });

  // « En situation » : la toile à l'échelle sur un mur, au-dessus d'un canapé de 2,10 m
  const MUR_L = 4.2, MUR_H = 2.7, SOL = 0.35; // mètres représentés
  function placerSituation() {
    const o = oeuvreOuverte;
    if (!o || situation.hidden) return;
    const piece = document.getElementById("situation-piece");
    const boite = situation.getBoundingClientRect();
    const total = MUR_H + SOL;
    const echelle = Math.min(boite.width / MUR_L, boite.height / total); // pixels par mètre
    piece.style.width = `${MUR_L * echelle}px`;
    piece.style.height = `${total * echelle}px`;
    const h = hauteurCm(o) / 100;
    const w = h * ratio(o);
    const bas = Math.max(1.0, 1.55 - h / 2); // centre à 1,55 m, jamais sur le dossier du canapé
    const toile = document.getElementById("situation-toile");
    toile.src = photo(o, 800);
    toile.alt = `${o.titre}, à l'échelle au-dessus d'un canapé`;
    Object.assign(toile.style, {
      width: `${w * echelle}px`,
      height: `${h * echelle}px`,
      left: `${((MUR_L - w) / 2) * echelle}px`,
      top: `${(MUR_H - bas - h) * echelle}px`,
    });
    const canape = piece.querySelector(".situation__canape");
    Object.assign(canape.style, {
      width: `${2.1 * echelle}px`,
      height: `${0.85 * echelle}px`,
      left: `${((MUR_L - 2.1) / 2) * echelle}px`,
      top: `${(MUR_H - 0.85 + 0.02) * echelle}px`,
    });
    piece.style.setProperty("--sol", `${(MUR_H / total) * 100}%`);
  }
  // La pièce en 3D est chargée seulement la première fois qu'on la demande
  let module3d = null;
  const chargement3d = document.getElementById("situation3d-chargement");
  function situation3d(o) {
    const zone3d = document.getElementById("situation3d");
    const piece2d = document.getElementById("situation-piece");
    chargement3d.hidden = false;
    module3d = module3d || import("./situation3d.js?v=5");
    module3d
      .then((m) => {
        if (oeuvreOuverte !== o || situation.hidden) return;
        m.ouvrir(zone3d, { image: photo(o, 1600), hauteur: hauteurCm(o) / 100, ratio: ratio(o) });
        chargement3d.hidden = true;
      })
      .catch(() => {
        // Pas de 3D possible (navigateur ancien, hors ligne…) : la version dessinée prend le relais
        zone3d.hidden = true;
        piece2d.hidden = false;
        situation.classList.add("est-en-2d");
        placerSituation();
      });
  }
  function fermer3d() {
    if (module3d) module3d.then((m) => m.fermer()).catch(() => {});
  }
  function montrerSituation(oui) {
    situation.hidden = !oui;
    ficheImg.hidden = oui;
    ficheZone.classList.remove("est-zoomee");
    ficheImg.removeAttribute("style");
    ficheZone.classList.toggle("est-en-situation", oui);
    boutonSituation.setAttribute("aria-pressed", String(oui));
    boutonToile.setAttribute("aria-pressed", String(!oui));
    document.getElementById("fiche-aide").hidden = oui;
    if (oui && oeuvreOuverte) {
      if (situation.classList.contains("est-en-2d")) requestAnimationFrame(placerSituation);
      else situation3d(oeuvreOuverte);
    } else fermer3d();
  }
  boutonToile.addEventListener("click", () => montrerSituation(false));
  boutonSituation.addEventListener("click", () => montrerSituation(true));
  window.addEventListener("resize", placerSituation);

  // Partager le lien direct de la toile
  boutonPartager.addEventListener("click", async () => {
    if (!oeuvreOuverte) return;
    const url = `${location.origin}${location.pathname}#/oeuvre/${slug(oeuvreOuverte)}`;
    const texte = `${oeuvreOuverte.titre}, Sébastianne Julin`;
    try {
      if (navigator.share) { await navigator.share({ title: texte, url }); return; }
      await navigator.clipboard.writeText(url);
      boutonPartager.textContent = "Lien copié";
      setTimeout(() => { boutonPartager.textContent = "Copier le lien"; }, 2200);
    } catch (e) { /* partage annulé */ }
  });

  // « Demander des informations » : direction le formulaire, déjà rempli
  function demanderInfos(o) {
    fermerFiche({ vers: "contact" });
    aller("contact");
    const champ = document.getElementById("message");
    champ.value = `Bonjour Sébastianne,\n\nJe souhaiterais des informations sur « ${o.titre} » (${[o.annee, format(o)].filter(Boolean).join(", ")}).\n\n`;
    setTimeout(() => sections.contact.querySelector('input[name="name"]').focus({ preventScroll: true }), 1100);
  }

  // ---------- Formulaire de contact ----------
  const formulaire = document.getElementById("formulaire");
  const etat = document.getElementById("formulaire-etat");
  const envoyer = document.getElementById("envoyer");
  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const donnees = Object.fromEntries(new FormData(formulaire));
    if (donnees.botcheck) return;
    if (!formulaire.checkValidity()) {
      const invalide = formulaire.querySelector(":invalid");
      etat.textContent = invalide && invalide.type === "email" && invalide.value
        ? "Cette adresse e-mail semble incomplète."
        : "Merci de remplir votre nom, votre e-mail et votre message.";
      etat.dataset.ton = "erreur";
      if (invalide) invalide.focus();
      return;
    }
    if (!WEB3FORMS_CLE) {
      // Pas encore de clé : on ouvre la messagerie avec le message pré-rempli
      const corps = `${donnees.message}\n\n${donnees.name}\n${donnees.email}`;
      location.href = `mailto:${EMAIL}?subject=${encodeURIComponent("Message depuis le site")}&body=${encodeURIComponent(corps)}`;
      etat.textContent = "Votre messagerie s'ouvre avec le message prêt à partir.";
      etat.dataset.ton = "";
      return;
    }
    envoyer.disabled = true;
    etat.textContent = "Envoi en cours…";
    etat.dataset.ton = "";
    try {
      const reponse = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_CLE,
          subject: `Message de ${donnees.name} depuis le site`,
          from_name: "Site Sébastianne Julin",
          name: donnees.name,
          email: donnees.email,
          message: donnees.message,
        }),
      });
      const resultat = await reponse.json();
      if (!resultat.success) throw new Error(resultat.message);
      formulaire.reset();
      etat.textContent = "Message envoyé. Sébastianne vous répondra par e-mail.";
      etat.dataset.ton = "ok";
    } catch (err) {
      etat.textContent = `L'envoi n'a pas abouti. Vous pouvez écrire directement à ${EMAIL}.`;
      etat.dataset.ton = "erreur";
    } finally {
      envoyer.disabled = false;
    }
  });

  // ---------- Mentions légales ----------
  const legal = document.getElementById("legal");
  let retourMentions = null;
  function fermerMentions() {
    legal.hidden = true;
    if (retourMentions) retourMentions.focus();
  }
  document.getElementById("ouvrir-mentions").addEventListener("click", (e) => {
    retourMentions = e.currentTarget;
    legal.hidden = false;
    document.getElementById("fermer-mentions").focus();
  });
  document.getElementById("fermer-mentions").addEventListener("click", fermerMentions);
  legal.addEventListener("click", (e) => { if (e.target === legal) fermerMentions(); });

  // ---------- Ambiance sonore (générée, sans fichier) ----------
  const boutonSon = document.getElementById("son");
  let audio = null;
  function lancerSon() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const maitre = ctx.createGain();
    maitre.gain.value = 0;
    maitre.connect(ctx.destination);
    const reverb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.8);
    }
    reverb.buffer = ir;
    reverb.connect(maitre);
    const filtre = ctx.createBiquadFilter();
    filtre.type = "lowpass";
    filtre.frequency.value = 1100;
    filtre.connect(maitre);
    filtre.connect(reverb);
    [110, 164.81, 220, 246.94, 329.63].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 10;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + i * 0.021;
      const amp = ctx.createGain();
      amp.gain.value = 0.016;
      lfo.connect(amp).connect(g.gain);
      o.connect(g).connect(filtre);
      o.start();
      lfo.start();
    });
    return { ctx, maitre };
  }
  boutonSon.addEventListener("click", () => {
    const actif = boutonSon.getAttribute("aria-pressed") !== "true";
    if (actif && !audio) audio = lancerSon();
    if (!audio) return;
    audio.ctx.resume();
    audio.maitre.gain.cancelScheduledValues(audio.ctx.currentTime);
    audio.maitre.gain.linearRampToValueAtTime(actif ? 0.8 : 0, audio.ctx.currentTime + (actif ? 2.5 : 0.5));
    boutonSon.setAttribute("aria-pressed", String(actif));
    boutonSon.setAttribute("aria-label", actif ? "Couper l'ambiance sonore" : "Lancer l'ambiance sonore");
  });

  // ---------- Démarrage ----------
  suivreAdresse();
})();
