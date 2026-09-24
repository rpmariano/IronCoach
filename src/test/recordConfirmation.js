import { screen, fireEvent } from '@testing-library/react';

/* Desde 2026-09-21 a confirmação de registo não sai sozinha — espera pelo
   "Continuar" («todas as mensagens que têm este caráter temporário devem
   deixar de o ter; quero que só desapareçam mediante ação do utilizador»).

   Quem fecha o formulário e navega é o `onDone` dessa confirmação, por isso
   qualquer teste que verifique o que acontece DEPOIS de gravar tem de a
   dispensar primeiro — tal como o atleta faz agora.

   Não há confirmação em todos os caminhos (um update direto sem registo
   novo, um erro da Edge Function), por isso não rebenta quando ela não
   aparece: quem garante que ela era mesmo precisa é a asserção seguinte do
   teste, que falha na mesma se o formulário não fechar. */
export async function dispensarConfirmacao() {
  try {
    const botao = await screen.findByTestId('record-confirmation-close', {}, { timeout: 1200 });
    fireEvent.click(botao);
  } catch {
    // Este caminho não mostra confirmação nenhuma.
  }
}
