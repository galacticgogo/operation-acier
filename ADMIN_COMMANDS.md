# Commandes Admin - Operation Acier

Le système de commandes admin est maintenant activé sur le serveur. Connectez-vous avec le compte admin:
- **Nom**: GalacticGogo9
- **Mot de passe**: Gogo2026!

## Utilisation

Envoyez une requête POST à `/api/admin/command` avec le token du compte admin:

```bash
curl -X POST http://localhost:8080/api/admin/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"command":"<COMMANDE>"}'
```

## Commandes disponibles

### Donner des ressources
- `give money <name> <amount>` - Donner de l'argent
- `give gems <name> <amount>` - Donner des gemmes
- `give xp <name> <amount>` - Donner de l'XP
- `give units <name> <unitId> <amount>` - Donner des unités (infantry, armor, heavy, jet, carrier, drone, artillery, helicopter, submarine, missile)

### Définir des valeurs
- `set money <name> <amount>` - Définir l'argent
- `set gems <name> <amount>` - Définir les gemmes
- `set xp <name> <amount>` - Définir l'XP
- `set level <name> <level>` - Définir le niveau
- `set population <name> <amount>` - Définir la population
- `set prestige <name> <amount>` - Définir le prestige
- `set units <name> <unitId> <amount>` - Définir les unités

### Gestion des comptes
- `get <name>` - Obtenir les infos d'un compte
- `reset <name>` - Réinitialiser un compte
- `reset all` - Réinitialiser tous les comptes
- `delete <name>` - Supprimer un compte
- `list accounts` - Lister tous les comptes avec leurs stats

### Autres commandes
- `wipe all` - Supprimer TOUS les données et recréer le compte admin

## Exemples

```bash
# Donner 1000 d'argent à un joueur
curl -X POST http://localhost:8080/api/admin/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"give money PlayerName 1000"}'

# Donner 500 XP à un joueur
curl -X POST http://localhost:8080/api/admin/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"give xp PlayerName 500"}'

# Donner 100 infantry à un joueur
curl -X POST http://localhost:8080/api/admin/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"give units PlayerName infantry 100"}'

# Lister tous les comptes
curl -X POST http://localhost:8080/api/admin/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"command":"list accounts"}'
```

## Notes
- Le compte admin est caché du classement
- Le compte admin ne peut pas être réinitialisé ou supprimé
- Toutes les commandes sont sauvegardées dans la base de données
