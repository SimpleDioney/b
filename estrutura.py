import os

# Define a estrutura do projeto
estrutura_projeto = {
    "package.json": "",
    "server.js": "// Arquivo principal do servidor",
    "config": {
        "database.js": "// Configuração do SQLite"
    },
    "routes": {
        "auth.js": "// Rotas de autenticação",
        "games.js": "// Rotas de gerenciamento de jogos",
        "users.js": "// Rotas de gerenciamento de usuários"
    },
    "services": {
        "wikipediaService.js": "// Integração com a API da Wikipédia"
    },
    "models": {
        "User.js": "// Modelo de usuário",
        "GameSession.js": "// Modelo de sessão de jogo",
        "PathHistory.js": "// Modelo de histórico de percurso"
    },
    "utils": {
        "auth.js": "// Funções de autenticação",
        "gameLogic.js": "// Lógica do jogo"
    }
}

# Função para criar arquivos e diretórios
def criar_estrutura(base_path, estrutura):
    for nome, conteudo in estrutura.items():
        caminho = os.path.join(base_path, nome)
        if isinstance(conteudo, dict):
            os.makedirs(caminho, exist_ok=True)
            criar_estrutura(caminho, conteudo)
        else:
            with open(caminho, 'w') as arquivo:
                arquivo.write(conteudo)

# Diretório base do projeto
diretorio_base = "./"

# Cria a estrutura do projeto
os.makedirs(diretorio_base, exist_ok=True)
criar_estrutura(diretorio_base, estrutura_projeto)

print(f"Estrutura do projeto '{diretorio_base}' criada com sucesso!")
