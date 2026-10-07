// Helpers puros das abas de OP do ShopFloor (sem DOM). Usados pelo index.html via window.SF.
(function (global) {
    var PREFIXO = 'op:';

    // encodeURIComponent deixa ' ( ) * ! ~ passarem; o id vai dentro de onclick="switchPage('...')".
    function enc(s) {
        return encodeURIComponent(String(s)).replace(/['()*!~]/g, function (c) {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
    }

    function opPageId(op) { return PREFIXO + enc(op.pmo) + ':' + enc(op.op); }
    function isOpPageId(id) { return typeof id === 'string' && id.indexOf(PREFIXO) === 0; }

    function acharOp(ops, id) {
        for (var i = 0; i < (ops || []).length; i++) {
            if (opPageId(ops[i]) === id) return ops[i];
        }
        return null;
    }

    function opLabel(op) { return 'OP ' + op.op; }
    function opTitle(op) { return [op.cliente, op.descricao].filter(Boolean).join(' — '); }
    function embedPath(op) { return '/embed/fluxo/' + enc(op.pmo) + '/' + enc(op.op); }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function mesmasOps(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (a[i].pmo !== b[i].pmo || a[i].op !== b[i].op ||
                a[i].cliente !== b[i].cliente || a[i].descricao !== b[i].descricao) return false;
        }
        return true;
    }

    // Até 2 SSOs por carga do iframe: o 2º cobre o token que o ShopFloor queimou sem abrir sessão
    // (o jti é gasto antes do GoTrue). Mais que isso é falha de verdade, não loop.
    var MAX_SSO = 2;

    function decidirAcao(msg, estado) {
        if (!msg || typeof msg.type !== 'string') return { acao: 'ignorar' };
        if (msg.type === 'sf-embed:ready') return { acao: 'pronto' };
        // 'expirado' = token vencido ou já usado: é caso de assinar outro, não de mostrar erro
        var pedeSso = msg.type === 'sf-embed:login-required' ||
            (msg.type === 'sf-embed:error' && msg.code === 'expirado');
        if (pedeSso) {
            var tentativas = (estado && estado.ssoTentativas) || 0;
            return tentativas < MAX_SSO ? { acao: 'sso' } : { acao: 'erro', codigo: 'sso-falhou' };
        }
        if (msg.type === 'sf-embed:error') return { acao: 'erro', codigo: msg.code || 'desconhecido' };
        return { acao: 'ignorar' };
    }

    function mensagemErro(codigo) {
        if (codigo === 'inactive' || codigo === 'forbidden') return 'Acesso ao ShopFloor desativado. Fale com o administrador.';
        if (codigo === 'op-not-found') return 'OP não encontrada no ShopFloor.';
        return 'Não foi possível carregar o fluxo da OP.';
    }

    global.SF = {
        opPageId: opPageId, isOpPageId: isOpPageId, acharOp: acharOp,
        opLabel: opLabel, opTitle: opTitle, embedPath: embedPath,
        escapeHtml: escapeHtml, mesmasOps: mesmasOps,
        decidirAcao: decidirAcao, mensagemErro: mensagemErro
    };
})(typeof window !== 'undefined' ? window : globalThis);
