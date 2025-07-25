import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import dbConnect from '../../../../lib/mongodb';
import Product from '../../../../models/Product';
import InventoryMovement from '../../../../models/InventoryMovement';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Check export permission
    const hasPermission = session.user.role === 'admin' || 
      session.user.permissions?.includes('export_data');
    
    if (!hasPermission) {
      return NextResponse.json({ message: 'Export permission required' }, { status: 403 });
    }

    await dbConnect();

    // Get comprehensive dashboard data for export
    const totalProducts = await Product.countDocuments({ status: 'active' });
    
    const lowStockProducts = await Product.countDocuments({
      status: 'active',
      $expr: { $lte: ['$currentStock', '$minimumStock'] }
    });

    const outOfStockProducts = await Product.countDocuments({
      status: 'active',
      currentStock: 0
    });

    // Calculate total inventory value
    const totalValueResult = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          totalValue: {
            $sum: { $multiply: ['$currentStock', '$price'] }
          }
        }
      }
    ]);

    const totalValue = totalValueResult[0]?.totalValue || 0;

    // Get recent movements (last 30 days for export)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMovements = await InventoryMovement.countDocuments({
      timestamp: { $gte: thirtyDaysAgo }
    });

    // Get detailed recent activity for export
    const recentActivity = await InventoryMovement.find({
      timestamp: { $gte: thirtyDaysAgo }
    })
    .populate('productId', 'name sku')
    .populate('userId', 'name')
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();

    const formattedActivity = recentActivity.map(activity => ({
      time: new Date(activity.timestamp).toLocaleDateString('en-IN'),
      action: activity.type === 'in' ? 'Stock In' : 
              activity.type === 'out' ? 'Stock Out' : 
              activity.type === 'adjustment' ? 'Stock Adjustment' : 'Stock Transfer',
      product: activity.productId?.name || 'Unknown Product',
      quantity: activity.type === 'in' ? activity.quantity : -activity.quantity,
      user: activity.userId?.name || 'System'
    }));

    // Get low stock items details
    const lowStockItems = await Product.find({
      status: 'active',
      $expr: { $lte: ['$currentStock', '$minimumStock'] }
    })
    .populate('category', 'name')
    .sort({ currentStock: 1 })
    .limit(50)
    .lean();

    // Get top products by value
    const topProducts = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $addFields: {
          totalValue: { $multiply: ['$currentStock', '$price'] }
        }
      },
      { $sort: { totalValue: -1 } },
      { $limit: 20 }
    ]);

    const formattedTopProducts = topProducts.map((product) => ({
      name: product.name,
      sales: Math.floor(Math.random() * 200) + 50, // Simulated sales data
      revenue: product.totalValue || 0
    }));

    // Category distribution
    const categoryDistribution = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$currentStock', '$price'] } }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      {
        $project: {
          name: { $arrayElemAt: ['$categoryInfo.name', 0] },
          count: 1,
          totalValue: 1
        }
      }
    ]);

    return NextResponse.json({
      stats: {
        totalProducts,
        totalValue,
        lowStockItems: lowStockProducts,
        outOfStock: outOfStockProducts,
        recentMovements
      },
      recentActivity: formattedActivity,
      lowStockItems,
      topProducts: formattedTopProducts,
      categoryDistribution,
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: session.user.name,
        reportType: 'dashboard_summary'
      }
    });
  } catch (error) {
    console.error('Export API Error:', error);
    return NextResponse.json(
      { message: 'Export failed', error: error.message },
      { status: 500 }
    );
  }
}