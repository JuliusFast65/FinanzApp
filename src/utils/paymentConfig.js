// Configuración de la pasarela de pagos
export const PAYMENT_CONFIG = {
    // Stripe Configuration
    stripe: {
        publishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_test_key',
        plans: {
            premium: {
                priceId: 'price_premium_monthly', // ID del precio en Stripe
                amount: 499, // En centavos
                currency: 'usd',
                interval: 'month'
            }
        }
    },
    
    // URLs de la API (en producción, estas serían URLs reales)
    api: {
        createCheckoutSession: '/api/create-checkout-session',
        createPortalSession: '/api/create-portal-session',
        webhook: '/api/webhook'
    }
};

// Función para simular la creación de sesión de pago (para desarrollo)
export const createMockCheckoutSession = async (planId, user) => {
    // En desarrollo, simulamos la respuesta
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                sessionId: `mock_session_${Date.now()}`,
                url: `https://checkout.stripe.com/pay/${Date.now()}#fid=${Date.now()}`
            });
        }, 1000);
    });
};

// Función para manejar el éxito del pago
export const handlePaymentSuccess = async (sessionId, user, planId) => {
    // Aquí se actualizaría la suscripción en Firebase
    console.log('Pago exitoso:', { sessionId, user, planId });
    
    // Simular actualización en Firebase
    return {
        success: true,
        subscription: {
            isPremium: true,
            plan: planId,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
            features: getPlanFeatures(planId),
            updatedAt: new Date()
        }
    };
};

// Función para obtener características del plan
export const getPlanFeatures = (planId) => {
    const features = {
        premium: ['basic', 'unlimited_activities', 'advanced_export', 'custom_themes', 'detailed_stats', 'auto_backup', 'therapy_chat', 'writing_assistant', 'behavior_analysis', 'two_factor', 'priority_support', 'early_access']
    };
    return features[planId] || features.premium;
};

// Función para actualizar manualmente la suscripción (para desarrollo/testing)
export const updateSubscriptionManually = async (db, user, appId, plan = 'premium') => {
    if (!db || !user?.uid) {
        throw new Error('No se puede actualizar la suscripción: faltan credenciales');
    }
    
    const { doc, setDoc } = await import('firebase/firestore');
    const subscriptionRef = doc(db, 'artifacts', appId, 'users', user.uid, 'subscription', 'current');
    
    const newSubscription = {
        isPremium: plan === 'premium',
        plan: plan,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
        features: getPlanFeatures(plan),
        updatedAt: new Date()
    };
    
    await setDoc(subscriptionRef, newSubscription, { merge: true });
    console.log('Suscripción actualizada manualmente:', newSubscription);
    return newSubscription;
}; 