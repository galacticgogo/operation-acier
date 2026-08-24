# Operation Acier sur Roblox

Guide complet pour installer le portage Lua dans Roblox Studio.

## 1. Ce que tu vas obtenir

La version Roblox utilise directement les comptes Roblox. Aucun compte interne, aucun mot de passe et aucun formulaire de connexion ne sont necessaires.

Le portage comprend :

- une interface Roblox avec HUD et navigation ;
- une carte 2D de campagne ;
- les vues Boutique, Marche, Missions, Clan et Classement ;
- des missions avec recompenses ;
- une economie avec argent, gemmes et population ;
- une sauvegarde par UserId Roblox ;
- un acces administrateur verifie cote serveur ;
- un bouton de ressources admin illimitees pour ton compte.

## 2. Installer Roblox Studio

1. Va sur le site officiel Roblox Creator Hub.
2. Installe Roblox Studio.
3. Connecte-toi avec le compte Roblox qui doit devenir proprietaire du jeu.
4. Cree une nouvelle experience avec le modele **Baseplate**.
5. Publie-la immediatement avec **File > Publish to Roblox**.
6. Donne-lui le nom `Operation Acier`.

La publication est obligatoire pour que les DataStores puissent etre testes correctement.

## 3. Ouvrir les services Roblox

Dans Roblox Studio :

1. Ouvre **Home > Game Settings**.
2. Ouvre l'onglet **Security**.
3. Active **Enable Studio Access to API Services**.
4. Active **Allow HTTP Requests** uniquement si tu ajoutes plus tard une API externe.
5. Clique sur **Save**.

Pour la sauvegarde actuelle, seul l'acces API DataStore est necessaire.

## 4. Creer l'arborescence exacte

Dans l'onglet **Explorer**, cree cette structure :

```text
ReplicatedStorage
└── Config                         ModuleScript

ServerScriptService
├── Main.server                   Script
├── Admin.server                  Script
└── Services                      Folder
    ├── DataService                ModuleScript
    ├── EconomyService             ModuleScript
    └── MissionService             ModuleScript

StarterPlayer
└── StarterPlayerScripts
    └── FullUI.client              LocalScript
```

Les suffixes sont importants :

- `Main.server` doit etre un Script serveur ;
- `Admin.server` doit etre un Script serveur ;
- `FullUI.client` doit etre un LocalScript ;
- les trois fichiers du dossier Services doivent etre des ModuleScripts ;
- `Config` doit etre un ModuleScript.

## 5. Copier les fichiers

Depuis ce dossier local, copie le contenu de chaque fichier au bon endroit :

| Fichier local | Objet Roblox |
|---|---|
| [Config.lua](ReplicatedStorage/Config.lua) | `ReplicatedStorage > Config` |
| [DataService.lua](ServerScriptService/Services/DataService.lua) | `ServerScriptService > Services > DataService` |
| [EconomyService.lua](ServerScriptService/Services/EconomyService.lua) | `ServerScriptService > Services > EconomyService` |
| [MissionService.lua](ServerScriptService/Services/MissionService.lua) | `ServerScriptService > Services > MissionService` |
| [Main.server.lua](ServerScriptService/Main.server.lua) | `ServerScriptService > Main.server` |
| [Admin.server.lua](ServerScriptService/Admin.server.lua) | `ServerScriptService > Admin.server` |
| [FullUI.client.lua](StarterPlayer/StarterPlayerScripts/FullUI.client.lua) | `StarterPlayer > StarterPlayerScripts > FullUI.client` |

Pour copier un fichier : ouvre-le dans VS Code, selectionne tout, copie, puis colle dans le script Roblox correspondant.

## 6. Configurer ton compte admin

Tu dois connaitre ton UserId Roblox :

1. Ouvre ta page de profil Roblox dans un navigateur.
2. Dans l'URL, recupere le nombre entre `/users/` et ton nom.
3. Dans `ReplicatedStorage > Config`, remplace :

```lua
Config.AdminUserIds = {
    0,
}
```

par :

```lua
Config.AdminUserIds = {
    123456789,
}
```

Remplace `123456789` par ton vrai UserId. N'utilise pas ton pseudo : le UserId est plus fiable et ne peut pas etre change par le joueur.

## 7. Comprendre la sauvegarde

La sauvegarde est faite par `DataStoreService` :

```text
player.UserId -> player_<UserId> -> profil du joueur
```

Le profil contient :

- argent ;
- gemmes ;
- population ;
- niveau et XP ;
- prestige ;
- victoires et defaites ;
- unites ;
- usines ;
- missions terminees.

La sauvegarde est executee :

- quand le joueur quitte ;
- toutes les 60 secondes ;
- apres une mission ;
- apres les actions admin.

Le serveur valide et nettoie les valeurs avant de les sauvegarder. Le client ne doit jamais etre considere comme autoritaire.

## 8. Tester dans Roblox Studio

1. Verifie que ton UserId est bien dans `Config.AdminUserIds`.
2. Clique sur **Play**.
3. Attends le chargement de l'interface.
4. Verifie que le HUD affiche argent, gemmes, population et niveau.
5. Clique sur les boutons de navigation.
6. Ouvre `MISSIONS` et lance une mission.
7. Verifie que la recompense apparait dans le HUD.
8. Clique sur `ADMIN + INFINI`.
9. Verifie que l'argent et les gemmes changent.
10. Arrete la partie.
11. Relance **Play** et verifie que les valeurs sont toujours presentes.

Pour tester avec un autre joueur, utilise **Test > Start** avec plusieurs joueurs. Le bouton admin ne doit apparaitre que pour le compte dont le UserId est configure.

## 9. Tester la securite admin

Teste ces trois cas :

1. Ton compte admin voit le bouton `ADMIN + INFINI`.
2. Un autre compte Roblox ne voit pas ce bouton.
3. Meme si un autre joueur tente d'appeler le RemoteEvent, le serveur refuse car `Config.IsAdmin(player)` est verifie dans `Admin.server`.

Ne mets jamais uniquement une verification admin dans un LocalScript. Un exploit Roblox peut modifier le client, mais ne peut pas contourner une verification correctement faite dans un Script serveur.

## 10. Attention a l'ancien HUD

Le fichier [Map.client.lua](StarterPlayer/StarterPlayerScripts/Map.client.lua) est une ancienne version minimale de l'interface.

Dans Roblox Studio, ne l'ajoute pas si tu utilises `FullUI.client.lua`. Sinon les deux interfaces seront affichees en meme temps.

Utilise uniquement :

```text
StarterPlayer
└── StarterPlayerScripts
    └── FullUI.client
```

## 11. Publier le jeu

Quand les tests fonctionnent :

1. Clique sur **File > Publish to Roblox**.
2. Ouvre **Game Settings > Permissions**.
3. Regle la visibilite selon ton besoin.
4. Ajoute une icone et une miniature.
5. Dans **Monetization**, configure les achats uniquement quand l'economie sera definitive.
6. Copie le lien de l'experience.

## 12. Limites actuelles du portage

Le portage actuel fournit l'ossature jouable et l'interface principale. Certaines fonctions sont encore des prototypes :

- la boutique affiche les articles mais ne realise pas encore tous les achats ;
- le marche affiche ses categories mais n'a pas encore toutes les transactions ;
- le clan et le classement doivent encore etre connectes a leurs RemoteFunctions ;
- la carte est une interface 2D, pas un terrain 3D ;
- les modeles, sons, animations et effets Roblox restent a ajouter.

La meilleure suite consiste a finir une fonction a la fois : boutique, puis missions avancees, puis clans et classement.

## 13. Checklist finale

- [ ] Experience publiee
- [ ] API Services active
- [ ] UserId admin configure
- [ ] `Config` place dans ReplicatedStorage
- [ ] dossier Services cree correctement
- [ ] scripts serveur places dans ServerScriptService
- [ ] `FullUI.client` place dans StarterPlayerScripts
- [ ] ancien `Map.client` desactive
- [ ] test de mission reussi
- [ ] test de sauvegarde reussi
- [ ] test avec un second joueur reussi
- [ ] bouton admin invisible pour les autres comptes
- [ ] experience republiee
