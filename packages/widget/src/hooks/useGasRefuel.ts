import { useMemo } from 'react';
import { useFieldValues } from '../stores/form/useFieldValues.js';
import { useAvailableChains } from './useAvailableChains.js';
import { useGasRecommendation } from './useGasRecommendation.js';
import { useTokenBalance } from './useTokenBalance.js';

export const useGasRefuel = () => {
  const { getChainById } = useAvailableChains();

  const [fromChainId, fromTokenAddress, toChainId, toAddress] = useFieldValues(
    'fromChain',
    'fromToken',
    'toChain',
    'toAddress',
  );

  const toChain = getChainById(toChainId);
  const fromChain = getChainById(fromChainId);

  const { token: nativeToken } = useTokenBalance(
    toAddress,
    toChainId ? toChain?.nativeToken : undefined,
    toChain,
  );

  const { data: gasRecommendation, isLoading } = useGasRecommendation(
    toChainId,
    fromChainId,
    fromTokenAddress,
  );

  // When we bridge between ecosystems we need to be sure toAddress is set
  const isChainTypeSatisfied =
    fromChain?.chainType !== toChain?.chainType ? Boolean(toAddress) : true;

  const enabled = useMemo(() => {
    // 相同链类型：如果 fromChainId 和 toChainId 相同，则返回 false。因为在同一链上进行Gas补充是不允许的。
    // Gas推荐不可用：如果 gasRecommendation 不可用或没有推荐的Gas量，则返回 false。
    // 原生代币不可用：如果 nativeToken 不存在，则返回 false。
    // 链类型不满足条件：如果链类型不满足条件（即 isChainTypeSatisfied 为 false），则返回 false
    if (
      // We don't allow same chain refuel.
      // If a user runs out of gas, he can't send a source chain transaction.
      fromChainId === toChainId ||
      !gasRecommendation?.available ||
      !gasRecommendation?.recommended ||
      !nativeToken ||
      !isChainTypeSatisfied
    ) {
      return false;
    }
    const tokenBalance = nativeToken.amount ?? 0n;

    // Check if the user balance < 50% of the recommended amount
    const recommendedAmount = BigInt(gasRecommendation.recommended.amount) / 2n;

    // 获取用户的原生代币余额（tokenBalance）。
    // 计算推荐的Gas量的一半（recommendedAmount）。
    // 检查用户的余额是否小于推荐量的一半（insufficientGas）。
    // 如果用户的余额小于推荐量的一半，则返回 true，表示需要补充Gas；否则返回 false。
    const insufficientGas = tokenBalance < recommendedAmount;
    return insufficientGas;
  }, [
    fromChainId,
    gasRecommendation,
    isChainTypeSatisfied,
    nativeToken,
    toChainId,
  ]);

  return {
    enabled: enabled,
    availble: gasRecommendation?.available,
    isLoading: isLoading,
    chain: toChain,
    fromAmount: gasRecommendation?.available
      ? gasRecommendation.fromAmount
      : undefined,
  };
};
