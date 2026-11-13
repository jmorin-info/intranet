# Erreurs de connexion et renouvellement des sessions

Un refus de connexion ne signifie pas qu'une session existante a expiré.
Les réponses 401 de login, refresh, logout et des formulaires de récupération
de mot de passe sont rendues à leur appelant. Le formulaire conserve ainsi
le message du serveur ; il ne lance pas une deuxième authentification ni une
navigation automatique vers `session_expired`.

Les requêtes protégées, dont `/auth/me`, conservent le renouvellement par cookie.
Les requêtes en attente de ce renouvellement sont rejouées au plus une fois.
Un ancien header Bearer injecté depuis le stockage local est retiré du rejeu,
afin de ne pas masquer le nouveau cookie par un token devenu obsolète.
Les headers explicitement fournis par un appelant ne sont pas retirés.

Les réponses synthétiques des GET optionnels refusés en 403/429 conservent
les métadonnées Axios. Les intercepteurs suivants peuvent les examiner sans
déclencher une erreur de lecture de `response.config`.

La qualification couvre les chemins publics avec query/trailing slash,
l'absence de refresh et de redirection sur mauvais identifiants, le refresh
normal de `/auth/me`, les anciens headers, la file concurrente et les réponses
403/429. Les annulations intentionnelles restent couvertes séparément.
Le test navigateur de connexion utilise le vrai serveur et ses comptes MFA
de test dans le lot E2E ; aucun comportement de garde serveur n'est modifié ici.
