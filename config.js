require('dotenv').config()

module.exports = {
  deployments: {
    netId1: {
      eth: {
        instanceAddress: {
          '0.1': '0xf84115295E85cb01Ed9DCf8028b55EFD39709C67',
          '1': '0x47CE0C6eD5B0Ce3d3A51fdb1C52DC66a7c3c2936',
          '10': '0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF',
          '100': '0xA160cdAB225685dA1d56aa342Ad8841c3b53f291'
        },
        symbol: 'ETH',
        decimals: 18
      },
      dai: {
        instanceAddress: {
          '100': '0xD4B88Df4D29F5CedD6857912842cff3b20C8Cfa3',
          '1000': '0xFD8610d20aA15b7B2E3Be39B396a1bC3516c7144',
          '10000': '0xF60dD140cFf0706bAE9Cd734Ac3ae76AD9eBC32A',
          '100000': undefined
        },
        tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        symbol: 'DAI',
        decimals: 18
      },
      cdai: {
        instanceAddress: {
          '5000': '0x22aaA7720ddd5388A3c0A3333430953C68f1849b',
          '50000': '0xBA214C1c1928a32Bffe790263E38B4Af9bFCD659',
          '500000': '0xb1C8094B234DcE6e03f10a5b673c1d8C69739A00',
          '5000000': undefined
        },
        tokenAddress: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
        symbol: 'cDAI',
        decimals: 8
      },
      usdc: {
        instanceAddress: {
          '100': '0xd96f2B1c14Db8458374d9Aca76E26c3D18364307',
          '1000': '0x4736dCf1b7A3d580672CcE6E7c65cd5cc9cFBa9D',
          '10000': '0xD691F27f38B395864Ea86CfC7253969B409c362d',
          '100000': undefined
        },
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6
      },
      cusdc: {
        instanceAddress: {
          '5000': '0xaEaaC358560e11f52454D997AAFF2c5731B6f8a6',
          '50000': '0x1356c899D8C9467C7f71C195612F8A395aBf2f0a',
          '500000': '0xA60C772958a3eD56c1F15dD055bA37AC8e523a0D',
          '5000000': undefined
        },
        tokenAddress: '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
        symbol: 'cUSDC',
        decimals: 8
      },
      usdt: {
        instanceAddress: {
          '100': '0x169AD27A470D064DEDE56a2D3ff727986b15D52B',
          '1000': '0x0836222F2B2B24A3F36f98668Ed8F0B38D1a872f',
          '10000': '0xF67721A2D8F736E75a49FdD7FAd2e31D8676542a',
          '100000': '0x9AD122c22B14202B4490eDAf288FDb3C7cb3ff5E'
        },
        tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        decimals: 6
      }
    },
    netId42: {
      eth: {
        instanceAddress: {
          '0.1': '0xf84115295E85cb01Ed9DCf8028b55EFD39709C67'
        },
        symbol: 'ETH',
        decimals: 18
      }
    },
    netId5777:{
        eth:{
         instanceAddress:{
             '0.1':'0x7EFc0192C0Ed7D1A9fb5172016d370929f91d6E8'
         },
         symbol: 'ETH',
         decimals: 18
        }
    }
  }
}
