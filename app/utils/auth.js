const { GraphQLError } = require('graphql');

/**
 * Verifica se um usuário está autenticado no contexto.
 * Se não estiver, lança um erro padrão de autenticação do GraphQL.
 * @param {object} context - O objeto de contexto do resolver.
 */
function isAuthenticated(context) {
    if (!context.user) {
        throw new GraphQLError('Não autorizado. Você precisa estar logado para realizar esta ação.', {
            extensions: {
                code: 'UNAUTHENTICATED',
            },
        });
    }
}

module.exports = { isAuthenticated };