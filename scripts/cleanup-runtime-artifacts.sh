#!/bin/bash
# Cleanup Runtime Artifacts
# Limpa apenas arquivos de runtime (não versionados)
# Mantém artefatos de governança (versionados)

set -e

echo "🧹 Limpando artefatos de runtime do XOCP..."

# Diretórios de runtime (NÃO versionados)
RUNTIME_DIRS=(
  ".opencode/state/"
  ".opencode/execution-log/"
  ".opencode/dag.db*"
  ".opencode/governance-reports/"
)

for dir in "${RUNTIME_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "  Removendo: $dir"
    rm -rf "$dir"
  fi
done

# Remove arquivos temporários de database
find .opencode -name "*.db-journal" -delete 2>/dev/null || true
find .opencode -name "*.tmp" -delete 2>/dev/null || true

echo "✅ Limpeza concluída."
echo ""
echo "📦 Artefatos de governança PRESERVADOS (versionados):"
echo "   - .opencode/briefs/"
echo "   - .opencode/reviews/"
echo "   - .opencode/evolution/"
echo "   - .opencode/governance-skips.log"
