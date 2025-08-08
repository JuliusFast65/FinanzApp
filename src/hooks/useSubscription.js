import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export default function useSubscription(db, user, appId) {
    const [subscription, setSubscription] = useState({
        isPremium: false,
        plan: 'free',
        expiresAt: null,
        features: ['basic']
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!db || !user?.uid) {
            setIsLoading(false);
            return;
        }

        const subscriptionRef = doc(db, 'artifacts', appId, 'users', user.uid, 'subscription', 'current');
        
        const unsubscribe = onSnapshot(subscriptionRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setSubscription({
                    isPremium: data.isPremium || false,
                    plan: data.plan || 'free',
                    expiresAt: data.expiresAt ? new Date(data.expiresAt.toDate()) : null,
                    features: data.features || ['basic']
                });
            } else {
                // Si no existe suscripción, crear una por defecto
                const defaultSubscription = {
                    isPremium: false,
                    plan: 'free',
                    expiresAt: null,
                    features: ['basic'],
                    updatedAt: new Date()
                };
                setDoc(subscriptionRef, defaultSubscription, { merge: true });
                setSubscription(defaultSubscription);
            }
            setIsLoading(false);
        }, (error) => {
            console.error('Error al cargar suscripción:', error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [db, user, appId]);

    const updateSubscription = async (newSubscription) => {
        if (!db || !user?.uid) {
            throw new Error('No se puede actualizar la suscripción: faltan credenciales');
        }
        
        try {
            const subscriptionRef = doc(db, 'artifacts', appId, 'users', user.uid, 'subscription', 'current');
            await setDoc(subscriptionRef, newSubscription, { merge: true });
        } catch (error) {
            console.error('Error al actualizar suscripción en Firebase:', error);
            throw error;
        }
    };

    const hasFeature = (feature) => {
        // Mapeo de características premium
        const premiumFeatures = {
            'therapy_chat': subscription.plan === 'premium',
            'writing_assistant': subscription.plan === 'premium',
            'advanced_introspective_assistant': subscription.plan === 'premium',
            'behavior_analysis': subscription.plan === 'premium',
            'two_factor_auth': subscription.plan === 'premium',
            'unlimited_activities': subscription.plan === 'premium',
            'activity_sublevels': subscription.plan === 'premium',
            'activity_goals': subscription.plan === 'premium'
        };
        
        return premiumFeatures[feature] || subscription.features.includes(feature);
    };

    const isSubscriptionActive = () => {
        return subscription.isPremium && (!subscription.expiresAt || new Date() < subscription.expiresAt);
    };

    return {
        subscription,
        updateSubscription,
        hasFeature,
        isSubscriptionActive,
        isLoading
    };
} 