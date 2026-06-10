# Visionneuse d'images locale

Application web minimaliste pour parcourir des images stockées dans le dossier `img/`.

## Fonctionnement

- Chaque dossier de premier niveau sous `img/` devient une catégorie.
- Les sous-dossiers ne sont pas parcourus.
- Les formats d'images courants sont affichés automatiquement.
- La grille est responsive, respecte le format réel des images, et l'image s'ouvre en plein écran au clic.
- L'application reste accessible en local sur PC et sur mobile via le même réseau.
- Un bouton permet d’afficher ou masquer les détails comme le nom et la date.
- Une tierlist persistante classe les images en `S`, `A`, `B`, `C` ou sans catégorie.
- Le classement est sauvegardé localement dans `.image-tier-state.json`.
- Si deux fichiers ont le même nom, le classement est bloqué pour ces images et un avertissement s’affiche.

## Démarrage

```bash
npm install
npm run dev
```

Ensuite, ouvre l'URL affichée par Vite sur ton PC, puis utilise l'adresse IP locale de ton PC depuis le mobile, par exemple `http://192.168.1.20:5173`.

## Ajouter des images

Dépose tes images dans un ou plusieurs dossiers directement sous `img/`. Les sous-dossiers sont parcourus à l’intérieur de chaque catégorie.

## Production locale

```bash
npm run build
npm start
```

Le serveur Node sert alors l'interface compilée et l'API au même endroit.