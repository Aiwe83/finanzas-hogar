===========================================
COMANDOS MÁS IMPORTANTES DE CLAUDE CODE
===========================================


-------------------------------------------
SLASH COMMANDS (dentro de la sesión)
-------------------------------------------

/help              Ayuda general y lista de comandos
/clear             Limpia el contexto de la conversación actual
/compact           Comprime el historial manteniendo lo esencial
/model             Cambia el modelo (Opus / Sonnet / Haiku)
/fast              Activa modo rápido (Opus 4.6 con salida acelerada)
/config            Abre configuración
/cost              Muestra el consumo de tokens/coste
/login             Inicia sesión
/logout            Cierra sesión
/review            Revisa un pull request
/security-review   Revisión de seguridad de los cambios actuales
/init              Crea un CLAUDE.md inicial del proyecto
/loop <int> <cmd>  Ejecuta algo de forma recurrente
/schedule          Programa agentes remotos (cron)
/ultrareview       Revisión multi-agente en la nube de la rama/PR


-------------------------------------------
ATAJOS EN EL PROMPT
-------------------------------------------

!<comando>       Ejecuta un comando de shell y mete la salida en la conversación
#<texto>         Guarda una nota rápida en memoria
@<archivo>       Referencia un archivo concreto
Esc              Interrumpe la respuesta actual
Esc Esc          Vuelve atrás al mensaje anterior
Ctrl+C           Cancela la operación en curso
Ctrl+D           Sale de Claude Code
Shift+Tab        Cambia modo de permisos (plan / auto-accept / normal)
Flecha arriba    Navega hacia atrás en el historial de prompts
Flecha abajo     Navega hacia adelante en el historial de prompts


-------------------------------------------
CLI (desde la terminal)
-------------------------------------------

claude              Inicia sesión interactiva en el directorio actual
claude "prompt"     Ejecuta un prompt directo
claude -c           Continúa la última sesión
claude -r           Reanuda una sesión anterior (selector)
claude -p "prompt"  Modo no interactivo (print mode, ideal para scripts)
claude mcp          Gestiona servidores MCP
claude config       Configuración desde CLI
claude update       Actualiza a la última versión
claude doctor       Diagnóstico de la instalación


-------------------------------------------
ARCHIVOS CLAVE
-------------------------------------------

CLAUDE.md                       Instrucciones del proyecto (raíz o subdirectorios)
.claude/settings.json           Configuración del proyecto (hooks, permisos)
.claude/settings.local.json     Configuración local (no commiteada)
~/.claude/settings.json         Configuración global del usuario


-------------------------------------------
GIT (control de versiones local)
-------------------------------------------

git init                        Inicializa un repo en la carpeta actual
git status                      Estado del working tree (archivos modificados/untracked)
git status --short              Estado resumido en una línea por archivo
git add <archivo>               Añade archivo al staging area
git add .                       Añade todos los cambios (cuidado con untracked)
git restore --staged <archivo>  Saca un archivo del staging (conserva cambios)
git restore <archivo>           Descarta cambios del working tree (irreversible)
git diff                        Muestra cambios sin stagear
git diff --staged               Muestra cambios ya stageados
git commit -m "mensaje"         Crea un commit con los cambios stageados
git log --oneline -10           Últimos 10 commits en una línea
git log --graph --all           Gráfico de ramas
git branch                      Lista ramas locales
git branch <nombre>             Crea rama
git checkout <rama>             Cambia de rama
git switch <rama>               Cambia de rama (moderno)
git switch -c <nombre>          Crea y cambia a nueva rama
git merge <rama>                Fusiona rama en la actual
git rebase <rama>               Reaplica commits sobre otra rama
git stash                       Guarda cambios temporales
git stash pop                   Recupera el último stash
git reset --hard HEAD           Descarta TODO lo no commiteado (peligroso)


-------------------------------------------
GIT REMOTO (GitHub)
-------------------------------------------

git remote -v                   Lista remotes configurados
git remote add origin <url>     Conecta repo local con un remote
git remote set-url origin <url> Cambia la URL del remote
git push -u origin main         Primer push (crea tracking con main remoto)
git push                        Sube commits al remote (tras el -u inicial)
git push --force-with-lease     Force-push seguro (respeta cambios remotos)
git pull                        Descarga y fusiona cambios del remote
git pull --rebase               Pull manteniendo historia lineal
git fetch                       Descarga refs sin fusionar
git clone <url>                 Clona un repo remoto


-------------------------------------------
GITHUB CLI (gh)
-------------------------------------------

gh auth login                   Autentica la CLI con GitHub
gh auth status                  Ver sesión activa y scopes del token
gh repo create <nombre>         Crea repo en GitHub (modo interactivo)
gh repo create <nombre> --public --source=. --push
                                Crea repo público desde el directorio actual y hace push
gh repo create <nombre> --private --source=. --push
                                Igual pero privado
gh repo list                    Lista tus repos
gh repo view                    Info del repo actual (README, URL...)
gh repo view --web              Abre el repo en el navegador
gh repo clone <usuario/repo>    Clona un repo
gh pr create                    Crea un pull request (interactivo)
gh pr list                      Lista PRs abiertos
gh pr view <n>                  Detalles de un PR
gh pr checkout <n>              Hace checkout local de un PR
gh pr merge <n>                 Fusiona un PR
gh issue create                 Crea un issue
gh issue list                   Lista issues
gh run list                     Lista ejecuciones de GitHub Actions
gh run watch                    Sigue la última ejecución en vivo


-------------------------------------------
NETLIFY CLI (despliegues)
-------------------------------------------

netlify login                   Autentica con tu cuenta Netlify
netlify status                  Info del site vinculado al directorio actual
netlify link                    Vincula carpeta local con un site existente
netlify init                    Crea site nuevo (interactivo)
netlify deploy                  Deploy de PREVIEW (URL temporal)
netlify deploy --prod           Deploy a producción
netlify deploy --prod --dir=.   Deploy a producción publicando el directorio actual
netlify open                    Abre el dashboard del site
netlify open:site               Abre la URL de producción en el navegador
netlify env:list                Lista variables de entorno del site
netlify env:set KEY value       Define una variable de entorno


===========================================
