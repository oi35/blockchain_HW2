import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';

import BetTokenABI from './contracts/BetToken.json';
import EasyBetABI from './contracts/EasyBet.json';
import LotteryTicketABI from './contracts/LotteryTicket.json';

// 在部署后需要更新这些地址
const CONTRACT_ADDRESSES = {
  BetToken: '0xa9206EfC2Ee95AD987b125E16030F25636FBa164',  // BetToken地址
  EasyBet: '0x087e0c4c5C9E4c7987CE6183edF6f0914aAA9574',   // EasyBet地址
  LotteryTicket: '0x295e618aa224E5cd05D9eFA05c1aEb1255995A7C' // LotteryTicket地址
};

function App() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState<any>(null);
  const [signer, setSigner] = useState<any>(null);
  const [betTokenContract, setBetTokenContract] = useState<any>(null);
  const [easyBetContract, setEasyBetContract] = useState<any>(null);
  const [lotteryTicketContract, setLotteryTicketContract] = useState<any>(null);

  const [betBalance, setBetBalance] = useState('0');
  const [canClaim, setCanClaim] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>({});

  const [activities, setActivities] = useState<any[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [orderBook, setOrderBook] = useState<any[]>([]);
  const [myTickets, setMyTickets] = useState<any[]>([]);

  // 监听账户切换和自动连接
  useEffect(() => {
    // 检查是否已经连接
    const checkConnection = async () => {
      if ((window as any).ethereum) {
        const provider = new ethers.providers.Web3Provider((window as any).ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          // 已连接，自动重新连接
          await connectWallet();
        }
      }
    };

    // 监听账户切换
    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length > 0) {
        console.log('账户已切换到:', accounts[0]);
        // 重新连接钱包
        await connectWallet();
      } else {
        // 断开连接
        setAccount('');
        setBetBalance('0');
        setCanClaim(false);
        setActivities([]);
        setMyTickets([]);
      }
    };

    // 监听链切换
    const handleChainChanged = () => {
      // 链切换时刷新页面
      window.location.reload();
    };

    // 添加事件监听
    if ((window as any).ethereum) {
      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('chainChanged', handleChainChanged);
    }

    // 初始化时检查连接
    checkConnection();

    // 清理函数
    return () => {
      if ((window as any).ethereum) {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  // 连接钱包
  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      alert('请安装MetaMask!');
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider((window as any).ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();

      // 获取网络信息
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(address);

      setProvider(provider);
      setSigner(signer);
      setAccount(address);

      // 收集调试信息
      const debug: any = {
        account: address,
        ethBalance: ethers.utils.formatEther(balance),
        chainId: network.chainId,
        networkName: network.name,
        contracts: CONTRACT_ADDRESSES,
        timestamp: new Date().toLocaleString()
      };

      // 验证合约
      try {
        const betTokenCode = await provider.getCode(CONTRACT_ADDRESSES.BetToken);
        const easyBetCode = await provider.getCode(CONTRACT_ADDRESSES.EasyBet);
        const lotteryTicketCode = await provider.getCode(CONTRACT_ADDRESSES.LotteryTicket);

        debug.contractsExist = {
          BetToken: betTokenCode !== '0x',
          EasyBet: easyBetCode !== '0x',
          LotteryTicket: lotteryTicketCode !== '0x'
        };
      } catch (err) {
        debug.contractsExist = { error: 'Unable to check' };
      }

      setDebugInfo(debug);
      console.log('🔍 调试信息:', debug);

      // 初始化合约
      const betToken = new ethers.Contract(CONTRACT_ADDRESSES.BetToken, BetTokenABI.abi, signer);
      const easyBet = new ethers.Contract(CONTRACT_ADDRESSES.EasyBet, EasyBetABI.abi, signer);
      const lotteryTicket = new ethers.Contract(CONTRACT_ADDRESSES.LotteryTicket, LotteryTicketABI.abi, signer);

      setBetTokenContract(betToken);
      setEasyBetContract(easyBet);
      setLotteryTicketContract(lotteryTicket);

      // 加载数据
      loadUserData(betToken, easyBet, lotteryTicket, address, provider);
    } catch (error) {
      console.error('连接钱包失败:', error);
      alert('连接钱包失败: ' + (error as any).message);
    }
  };

  // 加载用户数据
  const loadUserData = async (betToken: any, easyBet: any, lotteryTicket: any, address: string, providerInstance: any) => {
    try {
      console.log('🔄 Loading user data for:', address);

      const balance = await betToken.balanceOf(address);
      setBetBalance(ethers.utils.formatEther(balance));

      const canClaimTokens = await betToken.canClaim(address);
      setCanClaim(canClaimTokens);

      // 获取当前区块时间（使用传入的 provider）
      let currentBlockTime = Math.floor(Date.now() / 1000); // 默认使用本地时间
      try {
        if (providerInstance) {
          const latestBlock = await providerInstance.getBlock('latest');
          currentBlockTime = latestBlock.timestamp;
          console.log('✅ Current blockchain time:', new Date(currentBlockTime * 1000).toLocaleString());
        } else {
          console.warn('⚠️ Provider not available, using local time');
        }
      } catch (blockError) {
        console.warn('⚠️ Failed to get blockchain time, using local time:', blockError);
      }

      const activityCount = await easyBet.getActivityCount();
      console.log('📊 Total activities:', activityCount.toNumber());

      const acts = [];
      for (let i = 0; i < activityCount; i++) {
        const activity = await easyBet.getActivity(i);
        const deadlineTimestamp = activity.deadline.toNumber();
        const isExpired = currentBlockTime >= deadlineTimestamp;

        console.log(`Activity #${i}:`, {
          name: activity.name,
          deadline: new Date(deadlineTimestamp * 1000).toLocaleString(),
          deadlineTimestamp,
          currentBlockTime,
          isExpired,
          settled: activity.settled
        });

        acts.push({
          id: activity.id.toNumber(),
          name: activity.name,
          creator: activity.creator,
          choices: activity.choices,
          odds: activity.odds.map((o: any) => o.toNumber()), // 赔率数组
          totalPool: ethers.utils.formatEther(activity.totalPool), // 对赌池
          deadline: new Date(deadlineTimestamp * 1000),
          settled: activity.settled,
          winningChoice: activity.winningChoice.toNumber(),
          isExpired: isExpired, // 基于区块时间判断是否过期
        });
      }
      setActivities(acts);
      console.log('✅ Loaded activities:', acts.length);

      const tickets = await lotteryTicket.getTicketsByOwner(address);
      console.log('🎫 Total tickets:', tickets.length);

      const ticketDetails = [];
      for (let tokenId of tickets) {
        const info = await lotteryTicket.getTicketInfo(tokenId);
        ticketDetails.push({
          tokenId: tokenId.toNumber(),
          activityId: info.activityId.toNumber(),
          choice: info.choice.toNumber(),
          price: ethers.utils.formatEther(info.price),
          odds: info.odds.toNumber(), // 锁定的赔率
        });
      }
      setMyTickets(ticketDetails);
      console.log('✅ Loaded tickets:', ticketDetails.length);
      console.log('✅ All user data loaded successfully!');
    } catch (error) {
      console.error('❌ 加载数据失败:', error);
    }
  };

  // 领取BET Token
  const claimTokens = async () => {
    try {
      const tx = await betTokenContract.claimTokens();
      await tx.wait();
      alert('成功领取1000 BET Token!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
    } catch (error: any) {
      console.error('领取失败:', error);
      alert('领取失败: ' + error.message);
    }
  };

  // 创建活动
  const createActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as any;
    const name = form.activityName.value;

    // 支持中英文逗号分隔
    const choices = form.choices.value.replace(/，/g, ',').split(',').map((c: string) => c.trim());
    const oddsInput = form.odds.value.replace(/，/g, ',').split(',').map((o: string) => parseFloat(o.trim()));
    const duration = Math.floor(parseFloat(form.duration.value) * 3600); // 小时转秒，支持小数

    // 赔率转换为基点（例如1.5 -> 150）
    const odds = oddsInput.map((o: number) => Math.floor(o * 100));

    try {
      // 不再需要approve，直接创建活动
      const tx = await easyBetContract.createActivity(name, choices, odds, duration);
      await tx.wait();
      alert('活动创建成功!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
      form.reset();
    } catch (error: any) {
      console.error('创建活动失败:', error);
      alert('创建失败: ' + error.message);
    }
  };

  // 购买彩票
  const buyTicket = async (activityId: number, choice: number) => {
    try {
      // 提示用户输入投注金额
      const amountStr = prompt('请输入投注金额（BET）:');
      if (!amountStr) return;

      const amount = ethers.utils.parseEther(amountStr);

      const approveTx = await betTokenContract.approve(CONTRACT_ADDRESSES.EasyBet, amount);
      await approveTx.wait();

      const tx = await easyBetContract.buyTicket(activityId, choice, amount);
      await tx.wait();
      alert('购买成功!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
    } catch (error: any) {
      console.error('购买失败:', error);
      alert('购买失败: ' + error.message);
    }
  };

  // 查看订单簿
  const viewOrderBook = async (activityId: number) => {
    try {
      const orderData = await easyBetContract.getOrderBook(activityId);
      const orders = orderData.orderIds.map((id: any, index: number) => ({
        orderId: id.toNumber(),
        ticketId: orderData.ticketIds[index].toNumber(),
        price: ethers.utils.formatEther(orderData.prices[index]),
        seller: orderData.sellers[index],
      }));
      setOrderBook(orders);
      setSelectedActivity(activityId);
    } catch (error: any) {
      console.error('加载订单簿失败:', error);
    }
  };

  // 创建订单
  const createOrder = async (ticketId: number, price: string) => {
    try {
      const approveTx = await lotteryTicketContract.approve(CONTRACT_ADDRESSES.EasyBet, ticketId);
      await approveTx.wait();

      const tx = await easyBetContract.createOrder(ticketId, ethers.utils.parseEther(price));
      await tx.wait();
      alert('订单创建成功!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
    } catch (error: any) {
      console.error('创建订单失败:', error);
      alert('创建订单失败: ' + error.message);
    }
  };

  // 购买订单
  const fillOrder = async (orderId: number, price: string) => {
    try {
      const priceWei = ethers.utils.parseEther(price);
      const approveTx = await betTokenContract.approve(CONTRACT_ADDRESSES.EasyBet, priceWei);
      await approveTx.wait();

      const tx = await easyBetContract.fillOrder(orderId);
      await tx.wait();
      alert('购买成功!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
      if (selectedActivity !== null) {
        viewOrderBook(selectedActivity);
      }
    } catch (error: any) {
      console.error('购买订单失败:', error);
      alert('购买失败: ' + error.message);
    }
  };

  // 修改订单价格
  const updateOrderPrice = async (orderId: number, currentPrice: string) => {
    try {
      const newPriceStr = prompt(`当前价格: ${currentPrice} BET\n请输入新价格（BET）:`);
      if (!newPriceStr) return;

      const newPrice = ethers.utils.parseEther(newPriceStr);
      const tx = await easyBetContract.updateOrderPrice(orderId, newPrice);
      await tx.wait();
      alert('价格修改成功!');
      if (selectedActivity !== null) {
        viewOrderBook(selectedActivity);
      }
    } catch (error: any) {
      console.error('修改价格失败:', error);
      alert('修改价格失败: ' + error.message);
    }
  };

  // 撤回订单
  const cancelOrderFromBook = async (orderId: number) => {
    try {
      const confirmed = window.confirm('确定要撤回这个订单吗？');
      if (!confirmed) return;

      const tx = await easyBetContract.cancelOrder(orderId);
      await tx.wait();
      alert('订单已撤回!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
      if (selectedActivity !== null) {
        viewOrderBook(selectedActivity);
      }
    } catch (error: any) {
      console.error('撤回订单失败:', error);
      alert('撤回失败: ' + error.message);
    }
  };

  // 结算活动
  const settleActivity = async (activityId: number, winningChoice: number) => {
    try {
      const tx = await easyBetContract.settleActivity(activityId, winningChoice);
      await tx.wait();
      alert('结算成功!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
    } catch (error: any) {
      console.error('结算失败:', error);
      alert('结算失败: ' + error.message);
    }
  };

  // 修改赔率
  const updateOdds = async (activityId: number) => {
    try {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return;

      // 提示用户输入新赔率
      const currentOddsStr = activity.odds.map((o: number) => (o / 100).toFixed(2)).join(',');
      const newOddsStr = prompt(`当前赔率: ${currentOddsStr}\n请输入新赔率（逗号分隔，例如：1.5,2.0）:`);
      if (!newOddsStr) return;

      // 支持中英文逗号
      const newOddsInput = newOddsStr.replace(/，/g, ',').split(',').map((o: string) => parseFloat(o.trim()));
      const newOdds = newOddsInput.map((o: number) => Math.floor(o * 100));

      const tx = await easyBetContract.updateOdds(activityId, newOdds);
      await tx.wait();
      alert('赔率修改成功!');
      loadUserData(betTokenContract, easyBetContract, lotteryTicketContract, account, provider);
    } catch (error: any) {
      console.error('修改赔率失败:', error);
      alert('修改赔率失败: ' + error.message);
    }
  };

  // 显示推进时间提示
  const showAdvanceTimeHint = async (activityId: number) => {
    try {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return;

      // 获取当前区块时间
      if (!provider) {
        alert('请先连接钱包！');
        return;
      }

      const latestBlock = await provider.getBlock('latest');
      const currentBlockTime = latestBlock.timestamp;
      const deadline = Math.floor(activity.deadline.getTime() / 1000);

      if (currentBlockTime >= deadline) {
        alert('活动已经过期，可以直接结算！');
        return;
      }

      const timeDiff = deadline - currentBlockTime;

      alert(
        `📌 活动还未到期，需要推进时间\n\n` +
        `当前区块时间: ${new Date(currentBlockTime * 1000).toLocaleString()}\n` +
        `活动截止时间: ${activity.deadline.toLocaleString()}\n` +
        `需要等待: 约 ${Math.ceil(timeDiff / 60)} 分钟\n\n` +
        `⏩ 快速推进时间（仅限Ganache测试）：\n\n` +
        `打开终端，执行以下命令：\n\n` +
        `cd contracts\n` +
        `npx hardhat run scripts/advance-time.ts --network ganache\n\n` +
        `执行后刷新页面即可结算活动。\n\n` +
        `💡 提示：也可以创建持续时间很短的活动进行测试（例如 0.01 小时）`
      );
    } catch (error: any) {
      console.error('显示推进时间提示失败:', error);
      alert('获取区块信息失败。\n\n请直接使用命令行推进时间：\n\ncd contracts\nnpx hardhat run scripts/advance-time.ts --network ganache');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎲 EasyBet - 去中心化彩票系统</h1>
        {!account ? (
          <button onClick={connectWallet} className="connect-btn">连接MetaMask钱包</button>
        ) : (
          <div className="account-info">
            <p>账户: {account.substring(0, 6)}...{account.substring(38)}</p>
            <p>BET余额: {parseFloat(betBalance).toFixed(2)} BET</p>
            {canClaim && (
              <button onClick={claimTokens} className="claim-btn">领取1000 BET Token</button>
            )}
          </div>
        )}
      </header>

      {/* 调试信息面板 */}
      {Object.keys(debugInfo).length > 0 && (
        <div className="container" style={{ maxWidth: '800px', margin: '20px auto' }}>
          <details style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '18px' }}>
              🔍 调试信息 (点击展开/收起)
            </summary>
            <div style={{ marginTop: '15px', fontSize: '14px' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>账户:</strong> <code>{debugInfo.account}</code>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>ETH余额:</strong> <code>{debugInfo.ethBalance} ETH</code>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>Chain ID:</strong> <code>{debugInfo.chainId}</code>
                {debugInfo.chainId === 1337 || debugInfo.chainId === 5777 ? (
                  <span style={{ color: '#4caf50', marginLeft: '10px' }}>✅ Ganache 网络</span>
                ) : (
                  <span style={{ color: '#f44336', marginLeft: '10px' }}>⚠️ 不是 Ganache!</span>
                )}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>网络名称:</strong> <code>{debugInfo.networkName}</code>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>时间戳:</strong> <code>{debugInfo.timestamp}</code>
              </div>
              <div style={{ marginTop: '15px', marginBottom: '10px' }}>
                <strong>合约地址:</strong>
              </div>
              <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', fontSize: '12px', overflow: 'auto' }}>
                {JSON.stringify(debugInfo.contracts, null, 2)}
              </pre>
              {debugInfo.contractsExist && (
                <>
                  <div style={{ marginTop: '15px', marginBottom: '10px' }}>
                    <strong>合约验证:</strong>
                  </div>
                  <div style={{ paddingLeft: '20px' }}>
                    <div style={{ marginBottom: '5px' }}>
                      BetToken: {debugInfo.contractsExist.BetToken ?
                        <span style={{ color: '#4caf50' }}>✅ 已部署</span> :
                        <span style={{ color: '#f44336' }}>❌ 未找到</span>
                      }
                    </div>
                    <div style={{ marginBottom: '5px' }}>
                      EasyBet: {debugInfo.contractsExist.EasyBet ?
                        <span style={{ color: '#4caf50' }}>✅ 已部署</span> :
                        <span style={{ color: '#f44336' }}>❌ 未找到</span>
                      }
                    </div>
                    <div style={{ marginBottom: '5px' }}>
                      LotteryTicket: {debugInfo.contractsExist.LotteryTicket ?
                        <span style={{ color: '#4caf50' }}>✅ 已部署</span> :
                        <span style={{ color: '#f44336' }}>❌ 未找到</span>
                      }
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      )}

      {account && (
        <div className="container">
          {/* 创建活动 */}
          <section className="section">
            <h2>📝 创建竞猜活动（公证人）</h2>
            <form onSubmit={createActivity} className="form">
              <input type="text" name="activityName" placeholder="活动名称" required />
              <input type="text" name="choices" placeholder="选项（逗号分隔，例如：Team A,Team B 或 Team A，Team B）" required />
              <input type="text" name="odds" placeholder="赔率（逗号分隔，例如：1.5,2.0 或 1.5，2.0）" required />
              <input type="number" step="0.01" name="duration" placeholder="持续时间（小时，支持小数，例如：1.5）" required />
              <button type="submit">创建活动</button>
            </form>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              💡 提示：赔率表示倍数，例如1.5表示投注100 BET，获胜可得150 BET<br/>
              支持中英文逗号分隔（, 或 ，）<br/>
              持续时间支持小数，例如0.5小时 = 30分钟，1.5小时 = 90分钟
            </p>
          </section>

          {/* 活动列表 */}
          <section className="section">
            <h2>🎯 竞猜活动列表</h2>
            {activities.length === 0 ? (
              <p>暂无活动</p>
            ) : (
              <div className="activities">
                {activities.map(activity => (
                  <div key={activity.id} className="activity-card">
                    <h3>{activity.name}</h3>
                    <p>
                      状态: {
                        activity.settled
                          ? `已结算 (获胜选项: ${activity.choices[activity.winningChoice]})`
                          : activity.isExpired
                            ? <span style={{ color: '#ff9800', fontWeight: 'bold' }}>⏰ 已过期，等待结算</span>
                            : <span style={{ color: '#4caf50' }}>✅ 进行中</span>
                      }
                    </p>
                    <p>对赌池: {parseFloat(activity.totalPool).toFixed(2)} BET</p>
                    <p>
                      截止: {activity.deadline.toLocaleString()}
                      {!activity.settled && activity.isExpired && (
                        <span style={{ color: '#ff9800', marginLeft: '10px' }}>(可以结算了)</span>
                      )}
                    </p>
                    {/* 调试信息 */}
                    <details style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                      <summary style={{ cursor: 'pointer' }}>🔍 调试信息</summary>
                      <div style={{ marginTop: '5px', paddingLeft: '10px' }}>
                        <p>活动ID: {activity.id}</p>
                        <p>创建者: {activity.creator}</p>
                        <p>当前账户: {account}</p>
                        <p>是创建者: {account.toLowerCase() === activity.creator.toLowerCase() ? '是' : '否'}</p>
                        <p>已结算: {activity.settled ? '是' : '否'}</p>
                        <p>已过期: {activity.isExpired ? '是' : '否'}</p>
                        <p style={{ color: activity.isExpired && !activity.settled && account.toLowerCase() === activity.creator.toLowerCase() ? '#4caf50' : '#f44336' }}>
                          应该显示结算按钮: {activity.isExpired && !activity.settled && account.toLowerCase() === activity.creator.toLowerCase() ? '是 ✅' : '否 ❌'}
                        </p>
                      </div>
                    </details>
                    <div className="choices" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', margin: '15px 0' }}>
                      {activity.choices.map((choice: string, index: number) => (
                        <div key={index} style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '8px', background: '#f9f9f9' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{choice}</div>
                          <div style={{ color: '#667eea', fontSize: '14px', marginBottom: '8px' }}>
                            赔率: {(activity.odds[index] / 100).toFixed(2)}x
                          </div>
                          <button
                            onClick={() => buyTicket(activity.id, index)}
                            disabled={activity.settled || activity.isExpired}
                            className="choice-btn"
                            style={{ width: '100%' }}
                          >
                            投注
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="activity-actions">
                      <button onClick={() => viewOrderBook(activity.id)} className="view-orders-btn">
                        查看订单簿
                      </button>
                      {account.toLowerCase() === activity.creator.toLowerCase() && !activity.settled && !activity.isExpired && (
                        <>
                          <button onClick={() => updateOdds(activity.id)} className="update-odds-btn" style={{ marginLeft: '10px' }}>
                            修改赔率
                          </button>
                          <button onClick={() => showAdvanceTimeHint(activity.id)} className="advance-time-btn" style={{ marginLeft: '10px', background: '#ff9800' }}>
                            ⏩ 如何推进时间
                          </button>
                        </>
                      )}
                      {account.toLowerCase() === activity.creator.toLowerCase() && !activity.settled && activity.isExpired && (
                        <div className="settle-section">
                          <select id={`winning-${activity.id}`} className="settle-select">
                            {activity.choices.map((choice: string, index: number) => (
                              <option key={index} value={index}>{choice}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const select = document.getElementById(`winning-${activity.id}`) as HTMLSelectElement;
                              settleActivity(activity.id, parseInt(select.value));
                            }}
                            className="settle-btn"
                          >
                            结算
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 订单簿 */}
          {selectedActivity !== null && (
            <section className="section">
              <h2>📊 活动 #{selectedActivity} 的订单簿</h2>
              {orderBook.length === 0 ? (
                <p>暂无订单</p>
              ) : (
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>订单ID</th>
                      <th>彩票ID</th>
                      <th>价格 (BET)</th>
                      <th>卖家</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderBook.map(order => (
                      <tr key={order.orderId}>
                        <td>{order.orderId}</td>
                        <td>{order.ticketId}</td>
                        <td>{parseFloat(order.price).toFixed(2)}</td>
                        <td>{order.seller.substring(0, 6)}...</td>
                        <td>
                          {account.toLowerCase() === order.seller.toLowerCase() ? (
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button onClick={() => updateOrderPrice(order.orderId, order.price)} className="update-price-btn" style={{ fontSize: '12px', padding: '5px 10px' }}>
                                修改价格
                              </button>
                              <button onClick={() => cancelOrderFromBook(order.orderId)} className="cancel-order-btn" style={{ fontSize: '12px', padding: '5px 10px', background: '#f44336' }}>
                                撤回
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => fillOrder(order.orderId, order.price)} className="buy-order-btn">
                              购买
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* 我的彩票 */}
          <section className="section">
            <h2>🎫 我的彩票</h2>
            {myTickets.length === 0 ? (
              <p>暂无彩票</p>
            ) : (
              <div className="tickets">
                {myTickets.map(ticket => {
                  const activity = activities.find(a => a.id === ticket.activityId);
                  const potentialPayout = (parseFloat(ticket.price) * ticket.odds / 100).toFixed(2);
                  return (
                    <div key={ticket.tokenId} className="ticket-card">
                      <h4>彩票 #{ticket.tokenId}</h4>
                      <p>活动: {activity ? activity.name : `#${ticket.activityId}`}</p>
                      <p>选择: {activity ? activity.choices[ticket.choice] : `选项${ticket.choice}`}</p>
                      <p>投注金额: {parseFloat(ticket.price).toFixed(2)} BET</p>
                      <p>锁定赔率: {(ticket.odds / 100).toFixed(2)}x</p>
                      <p style={{ color: '#667eea', fontWeight: 'bold' }}>
                        潜在收益: {potentialPayout} BET
                      </p>
                      {activity && !activity.settled && !activity.isExpired && (
                        <button
                          onClick={() => {
                            const price = prompt('设置出售价格（BET）:');
                            if (price) createOrder(ticket.tokenId, price);
                          }}
                          className="sell-btn"
                        >
                          挂单出售
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
