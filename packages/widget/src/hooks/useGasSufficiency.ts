import { type EVMChain, type RouteExtended, type Token } from '@lifi/sdk';
import { useQuery } from '@tanstack/react-query';
import type { Connector } from 'wagmi';
import { useAccount } from './useAccount.js';
import { useAvailableChains } from './useAvailableChains.js';
import { getTokenBalancesWithRetry } from './useTokenBalance.js';

export interface GasSufficiency {
  gasAmount: bigint;
  tokenAmount?: bigint;
  insufficientAmount?: bigint;
  insufficient?: boolean;
  token: Token;
  chain?: EVMChain;
}

const refetchInterval = 30_000;
// 计算每个交易步骤的Gas费用和非包含费用（例如手续费）。
// 将这些费用按链ID进行分组和累加。
// 确保用户在每个链上有足够的资金来支付这些费用，从而确保交易的顺利进行。
export const useGasSufficiency = (route?: RouteExtended) => {
  const { getChainById } = useAvailableChains();
  const { account } = useAccount({
    chainType: getChainById(route?.fromChainId)?.chainType,
  });

  const { data: insufficientGas, isLoading } = useQuery({
    queryKey: ['gas-sufficiency-check', account.address, route?.id],
    queryFn: async ({ queryKey: [, accountAddress] }) => {
      // We assume that LI.Fuel protocol always refuels the destination chain
      const hasRefuelStep = route!.steps
        .flatMap((step) => step.includedSteps)
        .some((includedStep) => includedStep.tool === 'lifuelProtocol');

      // 两层循环计算gas开销
      const gasCosts = route!.steps
        .filter((step) => !step.execution || step.execution.status !== 'DONE') // 过滤出尚未执行或执行状态不是'DONE'的步骤
        .reduce(
          (groupedGasCosts, step) => {
            // 是否跳过Refuel步骤的检查
            const skipDueToRefuel =
              step.action.fromChainId === route?.toChainId && hasRefuelStep;

            // 计算Gas费用
            if (
              step.estimate.gasCosts && // 有 gasCosts
              (account.connector as Connector)?.id !== 'safe' &&
              !skipDueToRefuel // 排除同链lifuelProtocol协议
            ) {
              const { token } = step.estimate.gasCosts[0];
              const gasCostAmount = step.estimate.gasCosts.reduce(
                (amount, gasCost) => amount + BigInt(gasCost.amount),
                0n,
              );
              // 分组
              groupedGasCosts[token.chainId] = {
                gasAmount: groupedGasCosts[token.chainId]
                  ? groupedGasCosts[token.chainId].gasAmount + gasCostAmount //累加
                  : gasCostAmount,
                token,
              };
            }

            // 计算非包含的费用

            // 在区块链交易中，费用通常分为两类：Gas费用和其他费用（例如手续费）。其中，Gas费用是指交易在区块链上执行所需的计算资源费用，而其他费用可能包括平台手续费、桥接费用等。
            // 非包含的费用（non - included fees）通常指的是那些不直接包含在Gas费用中的额外费用。这些费用需要单独支付，并且不会自动从Gas费用中扣除。换句话说，这些费用需要用户额外准备资金来支付。
            const nonIncludedFeeCosts = step.estimate.feeCosts?.filter(
              (feeCost) => !feeCost.included, // false
            );
            if (nonIncludedFeeCosts?.length) {
              const { token } = nonIncludedFeeCosts[0];
              const feeCostAmount = nonIncludedFeeCosts.reduce(
                (amount, feeCost) => amount + BigInt(feeCost.amount),
                0n,
              );
              groupedGasCosts[token.chainId] = {
                gasAmount: groupedGasCosts[token.chainId]
                  ? groupedGasCosts[token.chainId].gasAmount + feeCostAmount
                  : feeCostAmount,
                token,
              } as any;
            }

            return groupedGasCosts;
          },
          {} as Record<number, GasSufficiency>,
        );

      // Check whether we are sending a native token
      // For native tokens we want to check for the total amount, including the network fee
      if (
        route!.fromToken.address === gasCosts[route!.fromChainId]?.token.address
      ) {
        gasCosts[route!.fromChainId].tokenAmount =
          gasCosts[route!.fromChainId]?.gasAmount + BigInt(route!.fromAmount);
      }

      // 批量获取balance
      const tokenBalances = await getTokenBalancesWithRetry(
        accountAddress!,
        Object.values(gasCosts).map((item) => item.token),
      );

      if (!tokenBalances?.length) {
        return [];
      }

      [route!.fromChainId, route!.toChainId].forEach((chainId) => {
        if (gasCosts[chainId]) {
          const gasTokenBalance =
            tokenBalances?.find(
              (t) =>
                t.chainId === gasCosts[chainId].token.chainId &&
                t.address === gasCosts[chainId].token.address,
            )?.amount ?? 0n;
          const insufficient =
            gasTokenBalance <= 0n ||
            gasTokenBalance < gasCosts[chainId].gasAmount ||
            gasTokenBalance < (gasCosts[chainId].tokenAmount ?? 0n);

          const insufficientAmount = insufficient
            ? gasCosts[chainId].tokenAmount
              ? gasCosts[chainId].tokenAmount! - gasTokenBalance
              : gasCosts[chainId].gasAmount - gasTokenBalance
            : undefined;

          gasCosts[chainId] = {
            ...gasCosts[chainId],
            insufficient,
            insufficientAmount,
            chain: insufficient ? getChainById(chainId) : undefined,
          };
        }
      });

      const gasCostResult = Object.values(gasCosts).filter(
        (gasCost) => gasCost.insufficient,
      );

      return gasCostResult;
    },

    enabled: Boolean(account.address && route),
    refetchInterval,
    staleTime: refetchInterval,
  });

  return {
    insufficientGas,
    isLoading,
  };
};
